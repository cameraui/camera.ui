from __future__ import annotations

import truststore

truststore.inject_into_ssl()

import asyncio
import faulthandler
import importlib.util
import os
import sys
from collections.abc import Coroutine
from contextlib import suppress
from pathlib import Path
from types import ModuleType
from typing import Any, Literal, cast

from _camera_ui_tools.camera_ui_common import (
    LoggerOptions,
    LoggerService,
    SignalHandler,
)
from _camera_ui_tools.camera_ui_rpc import (
    CloseHandler,
    NoResponderRetryOptions,
    PrivateChannel,
    RPCClient,
    create_rpc_client,
)
from _camera_ui_tools.camera_ui_sdk import API_EVENT, BasePlugin, Camera
from _camera_ui_tools.camera_ui_sdk import CameraDevice as CameraDeviceInterface
from plugins.runtime.python.config_db import (
    LocalPluginConfigDb,
    PluginConfigDb,
    PluginConfigStoreRPC,
    RemotePluginConfigDb,
)
from plugins.runtime.python.host_protocol import (
    INSTANCE_ID_ENV,
    host_stop_budget,
    listen_for_host_stop,
    reset_signals_in_forks,
)
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.plugin_api import PluginAPI
from plugins.runtime.python.proxy.camera_device import CameraDeviceProxy
from plugins.runtime.python.proxy.file_serve import PluginFileServer
from plugins.runtime.python.resync import ResyncScheduler
from plugins.runtime.python.store import PluginStoreFile
from plugins.runtime.python.typings import (
    PLUGIN_COMMAND,
    PLUGIN_STATUS,
    PluginInfo,
    ProcessLoadMessage,
    ProcessMessage,
    ProcessResponse,
    ResumeData,
)

process_name = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1] if len(sys.argv) > 1 else "Plugin"

# Windows has no process title to set (setproctitle only creates a named object there) and no wheel for arm64
if sys.platform != "win32":
    import setproctitle

    setproctitle.setproctitle(f"camera.ui - {process_name}")

SHUTDOWN_LISTENER_TIMEOUT = 1.5
RPC_TEARDOWN_TIMEOUT = 1.0
CONNECT_DEADLINE = 15.0
HANDSHAKE_LEVEL = 2
REATTACH_DEADLINE = 240.0
REATTACH_RETRY_DELAYS = (1.0, 2.0, 5.0, 10.0)
# the host gives up on a start after 300 s, the stacks have to reach the log before
START_STACKS_AFTER = 240.0

Phase = Literal["ready-sent", "starting", "started", "reattach-wait", "reattaching", "start-error"]


class PluginChild:
    def __init__(self) -> None:
        self.endpoints = os.environ["PROXY_ENDPOINTS"].split(",")
        self._connect_error: str | None = None
        self._connect_failed = asyncio.Event()

        self.proxy: RPCClient = create_rpc_client(
            {
                "name": NamespaceManager.plugin_namespaces(os.environ["PLUGIN_ID"]).plugin_child,
                "servers": self.endpoints,
                "auth": {
                    "user": os.environ["PROXY_USER"],
                    "password": os.environ["PROXY_PASSWORD"],
                },
                "reconnected_cb": self._on_rpc_reconnected,
                "error_cb": self._on_rpc_error,
            }
        )

        for key in [
            "PROXY_USER",
            "PROXY_PASSWORD",
            "PROXY_ENDPOINTS",
            "PROXY_CERT",
            "PROXY_KEY",
            "PROXY_CA",
        ]:
            if key in os.environ:
                del os.environ[key]

        self.display_name = process_name

        logger_options: LoggerOptions = {
            "prefix": self.display_name,
            "debug_enabled": os.environ.get("LOGGER_LEVEL") in ["debug", "trace"],
            "trace_enabled": os.environ.get("LOGGER_LEVEL") == "trace",
            "target_id": os.environ.get("PLUGIN_ID"),
            "target_type": "plugin",
            "plugin_id": os.environ.get("PLUGIN_ID"),
        }

        self.logger = LoggerService(logger_options)
        self.logger.set_child_process_mode(True)

        self.api: PluginAPI | None = None
        self.plugin: BasePlugin | None = None
        self.channel: PrivateChannel | None = None
        self.close_proxy: CloseHandler | None = None
        self.file_server: PluginFileServer | None = None
        self.plugin_db: PluginConfigDb | None = None

        self.stopped = False
        self.instance_id = os.environ.get(INSTANCE_ID_ENV) or None
        self._phase: Phase = "ready-sent"
        self._attached_run: str | None = None
        self._pending_resume: str | None = None
        self._level2_master = False
        self._start_error: str | None = None
        self._stop_task: asyncio.Task[None] | None = None
        self._resync = ResyncScheduler(self._resync_managers)

        self.signal_handler = SignalHandler(
            {
                "display_name": "[Signal]",
                "timeout_duration": host_stop_budget(2),
                "logger": self.logger,
                "close_function": self.stop_plugin,
            }
        )

    async def run(self) -> None:
        try:
            self.signal_handler.setup_handlers()
            reset_signals_in_forks()
            listen_for_host_stop(self.signal_handler)

            try:
                await self.connect_proxy()
            except Exception as error:
                self.logger.error(str(error))
                raise SystemExit(1) from None

            await self.on_start()
            await self.signal_handler.shutdown_event.wait()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.logger.error(f"Failed to connect to proxy server: {e}")
            raise
        finally:
            await self.stop_plugin()

    async def connect_proxy(self) -> None:
        connecting = asyncio.ensure_future(self.proxy.connect())
        failed = asyncio.ensure_future(self._connect_failed.wait())

        try:
            await asyncio.wait(
                {connecting, failed},
                timeout=CONNECT_DEADLINE,
                return_when=asyncio.FIRST_COMPLETED,
            )

            if connecting.done():
                await connecting
                return

            reason = self._connect_error or f"no answer within {CONNECT_DEADLINE:.0f}s"
            raise RuntimeError(f"camera.ui not reachable on {', '.join(self.endpoints)}: {reason}")
        finally:
            for task in (connecting, failed):
                task.cancel()

    async def _on_rpc_error(self, error: Exception) -> None:
        self._connect_error = f"{type(error).__name__}: {error}" if str(error) else type(error).__name__
        self._connect_failed.set()

    async def _on_rpc_reconnected(self) -> None:
        self._resync.trigger()

    def _on_worker_link(self, _message: Any) -> None:
        self._resync.trigger()

    def _resync_managers(self) -> None:
        if self.stopped or self.api is None:
            return
        self.api.sensor_manager.on_rpc_reconnected()
        self.api.device_manager.on_rpc_reconnected()

    async def on_start(self) -> None:
        await self._open_channel()
        await self._send_ready(resume=False)

    async def _open_channel(self) -> None:
        channel = await self.proxy.private_channel("plugin-communication", "camera.ui")

        async def on_close() -> None:
            await self._on_channel_close(channel)

        channel.on("message", self.on_message)
        channel.on("close", on_close)
        self.channel = channel

    async def _on_channel_close(self, channel: PrivateChannel) -> None:
        if self.stopped or channel is not self.channel or not self._level2_master:
            return
        try:
            await self._open_channel()
        except Exception as error:
            self.logger.warn(f"Could not open the channel to camera.ui again: {error}")

    async def start_plugin(self, data: ProcessLoadMessage, run_id: str | None) -> None:
        self._phase = "starting"
        faulthandler.dump_traceback_later(START_STACKS_AFTER)
        try:
            # on a worker the master's storage path from START points at the wrong machine
            storage_path = os.environ.get("PLUGIN_STORAGE_PATH") or data["storage"]["storagePath"]
            plugin_info = data["plugin"]
            cameras = data["cameras"]

            self.plugin_db = await self.configure_plugin_db(storage_path, plugin_info["id"])

            self.api = PluginAPI(
                self.proxy,
                plugin_info,
                storage_path,
                self.logger,
                self.plugin_db,
            )
            await self.api.download_manager.init()

            plugin_constructor = self.load_plugin()
            plugin_storage = await self.api.storage_controller.createStorage("plugin")
            self.plugin = cast(BasePlugin, plugin_constructor(self.logger, self.api, plugin_storage))

            if hasattr(self.plugin, "storage_schema") and self.plugin.storage_schema:
                plugin_storage.defineSchemas(self.plugin.storage_schema)

            namespaces = NamespaceManager.plugin_namespaces(plugin_info["id"])
            self.close_proxy = await self.proxy.register_handler(
                namespaces.plugin_child_rpc, self.plugin, without_decorators=True
            )

            if os.environ.get("PLUGIN_REMOTE_MODE"):
                self.file_server = PluginFileServer(self.proxy, plugin_info["id"])
                await self.file_server.register()

            # a worker's own connection stays up when its link to the master drops
            link_subject = os.environ.get("CAMERAUI_WORKER_LINK_SUBJECT")
            if link_subject:
                await self.proxy.subscribe(link_subject, self._on_worker_link)

            self.api.device_manager.set_plugin(self.plugin)
            self.api.sensor_manager.set_plugin(self.plugin)

            await self.api.device_manager.init()
            await self.api.core_manager.init()
            await self.configure_cameras(self.api, plugin_info, cameras)
            await self.api.sensor_manager.init()
            await self.api.sensor_manager.configure_adopted_sensors()

            self._phase = "started"
            self._attached_run = run_id
            await self._send_started()

            await asyncio.sleep(0.1)

            self.api.emit(API_EVENT.FINISH_LAUNCHING)
        except Exception as e:
            self._phase = "start-error"
            self._start_error = str(e)
            await self._send_error(str(e))
            return
        finally:
            faulthandler.cancel_dump_traceback_later()

        await self._answer_pending_resume()

    async def _reattach(self, data: ProcessLoadMessage, run_id: str) -> None:
        self._phase = "reattaching"
        try:
            await self._run_reattach_steps(data["cameras"])
        except Exception as error:
            self._phase = "start-error"
            self._start_error = f"could not attach to the new camera.ui run: {error}"
            self.logger.error(f"Could not attach to the new camera.ui run: {error}")
            await self._send_error(self._start_error, code="resume-mismatch")
            return

        self._phase = "started"
        self._attached_run = run_id
        self.logger.debug(f"Attached to camera.ui run {run_id}")
        await self._send_started(resumed=True)
        await self._answer_pending_resume()

    async def _run_reattach_steps(self, cameras: list[Camera]) -> None:
        api = self.api
        if api is None:
            raise RuntimeError("the plugin never started")

        async def reattach_devices() -> None:
            await api.device_manager.reattach(cameras)

        async def flush_config() -> None:
            if self.plugin_db is not None:
                await self.plugin_db.flush()

        steps = [api.sensor_manager.reattach, reattach_devices, flush_config]
        loop = asyncio.get_running_loop()
        deadline = loop.time() + REATTACH_DEADLINE
        attempt = 0
        while True:
            failed: list[Any] = []
            last_error: Exception | None = None
            for step in steps:
                try:
                    await step()
                except Exception as error:
                    failed.append(step)
                    last_error = error
            if last_error is None:
                return

            delay = REATTACH_RETRY_DELAYS[min(attempt, len(REATTACH_RETRY_DELAYS) - 1)]
            if loop.time() + delay > deadline:
                raise last_error
            self.logger.debug(f"Attaching to camera.ui failed, retrying in {delay:.0f}s: {last_error}")
            attempt += 1
            await asyncio.sleep(delay)
            steps = failed

    async def _on_start_command(self, data: ProcessLoadMessage) -> None:
        session = data.get("session")
        run_id = session.get("runId") if session else None
        if session:
            self._level2_master = True

        if self._phase == "ready-sent":
            await self.start_plugin(data, run_id)
        elif self._phase in ("started", "reattach-wait") and run_id and run_id != self._attached_run:
            await self._reattach(data, run_id)
        else:
            self.logger.debug(f"Ignored START while {self._phase}")

    async def _on_resume(self, run_id: str | None) -> None:
        self._level2_master = True
        match self._phase:
            case "ready-sent":
                await self._send_ready(resume=False)
            case "starting" | "reattaching":
                self._pending_resume = run_id
            case "started" if run_id == self._attached_run:
                await self._send_started(resumed=True)
            case "started" | "reattach-wait":
                self._phase = "reattach-wait"
                await self._send_ready(resume=True)
            case "start-error":
                await self._send_error(self._start_error or "the plugin failed to start")

    async def _answer_pending_resume(self) -> None:
        run_id = self._pending_resume
        self._pending_resume = None
        if run_id is not None:
            await self._on_resume(run_id)

    async def _send_ready(self, resume: bool) -> None:
        await self.send_message(
            {
                "type": PLUGIN_STATUS.READY.value,
                "instanceId": self.instance_id,
                "handshake": HANDSHAKE_LEVEL,
                "resume": resume,
            }
        )

    async def _send_started(self, resumed: bool = False) -> None:
        message: ProcessResponse = {
            "type": PLUGIN_STATUS.STARTED.value,
            "instanceId": self.instance_id,
            "runId": self._attached_run,
        }
        if resumed:
            message["resumed"] = True
        await self.send_message(message)

    async def _send_error(self, error: str, code: Literal["resume-mismatch"] | None = None) -> None:
        message: ProcessResponse = {
            "type": PLUGIN_STATUS.ERROR.value,
            "error": error,
            "instanceId": self.instance_id,
        }
        if code:
            message["code"] = code
        await self.send_message(message)

    async def stop_plugin(self) -> None:
        if self.stopped:
            return

        self.stopped = True
        self._resync.close()

        if self.api:
            completed = await self.api.emit_and_wait(
                API_EVENT.SHUTDOWN.value,
                timeout=SHUTDOWN_LISTENER_TIMEOUT,
                on_error=lambda e: self.logger.error(f"Shutdown listener failed: {e}"),
            )
            if not completed:
                self.logger.warn(
                    f"Shutdown listeners still pending after {SHUTDOWN_LISTENER_TIMEOUT}s, continuing teardown"
                )

            await self.api.sensor_manager.close()
            await self.api.device_manager.close()
            await self.api.core_manager.close()
            await self.api.download_manager.close()
            await self.api.storage_controller.close()

            self.api.cancel()

        if self.plugin_db is not None:
            with suppress(Exception):
                await self.plugin_db.close()
            self.plugin_db = None

        try:
            await asyncio.wait_for(self._close_rpc(), timeout=RPC_TEARDOWN_TIMEOUT)
        except TimeoutError:
            self.logger.warn(f"RPC teardown still pending after {RPC_TEARDOWN_TIMEOUT}s, exiting anyway")

    async def _close_rpc(self) -> None:
        if self.channel:
            with suppress(Exception):
                await self.channel.close()

        if self.file_server:
            with suppress(Exception):
                await self.file_server.close()
            self.file_server = None

        if self.close_proxy:
            with suppress(Exception):
                await self.close_proxy()

        with suppress(Exception):
            await self.proxy.disconnect()

    async def send_message(self, message: ProcessResponse) -> None:
        if not self.channel:
            return

        try:
            await self.channel.send(message)
        except Exception as error:
            self.logger.debug(f"Could not send {message['type']} to camera.ui: {error}")

    async def on_message(self, message: ProcessMessage) -> None:
        if self.stopped:
            return

        match message["type"]:
            case PLUGIN_COMMAND.START.value:
                data = cast("ProcessLoadMessage | None", message["data"])
                if not data:
                    await self._send_error("No data provided")
                    return

                # every instance listens on the channel, a START names its target
                session = data.get("session")
                target = session.get("instanceId") if session else None
                if target and self.instance_id and target != self.instance_id:
                    self.logger.debug(f"Ignored START for instance {target}")
                    return

                await self._on_start_command(data)
            case PLUGIN_COMMAND.RESUME.value:
                resume = cast("ResumeData | None", message["data"])
                target = resume.get("instanceId") if resume else None
                if target and self.instance_id and target != self.instance_id:
                    return
                await self._on_resume(resume.get("runId") if resume else None)
            case PLUGIN_COMMAND.STOP.value:
                # exits too, nobody would watch a stopped plugin left running
                self._stop_task = asyncio.create_task(self.signal_handler.gracefully_close("stop command"))
            case _:
                pass

    async def configure_plugin_db(self, storage_path: str, plugin_id: str) -> PluginConfigDb:
        # config lives on the master so it survives a move to another worker
        if os.environ.get("PLUGIN_CONFIG_STORE_RPC"):
            namespace = NamespaceManager.plugin_namespaces(plugin_id).plugin_config_store_rpc
            remote_db = RemotePluginConfigDb(
                self.proxy.create_proxy(namespace, PluginConfigStoreRPC),
                self.proxy.create_proxy(
                    namespace, PluginConfigStoreRPC, no_responder_retry=NoResponderRetryOptions(max_retries=0)
                ),
                storage_path,
                self.instance_id,
                self.logger,
            )
            await remote_db.init()
            return remote_db

        volume_dir = Path(storage_path) / "volume"

        store = PluginStoreFile(str(volume_dir), self.logger)
        await store.open()
        return LocalPluginConfigDb(store)

    async def configure_cameras(self, api: PluginAPI, plugin_info: PluginInfo, cameras: list[Camera]) -> None:
        cameras_devices: list[CameraDeviceProxy] = []

        for camera in cameras:
            camera_logger = self.logger.create_logger(
                {
                    "suffix": camera["name"],
                    "target_id": camera["_id"],
                    "target_type": "camera",
                }
            )
            cameras_devices.append(
                CameraDeviceProxy(
                    self.proxy,
                    api.storage_controller,
                    api.sensor_manager,
                    camera,
                    plugin_info,
                    camera_logger,
                )
            )

        if self.api:
            await self.api.device_manager.configureCameras(cameras_devices)

        if self.plugin:
            await self.plugin.configureCameras(cast(list[CameraDeviceInterface], cameras_devices))

    def load_plugin(self) -> Any:
        module_path = os.environ.get("MODULE_PATH")
        if not module_path:
            raise Exception("MODULE_PATH environment variable not set")

        if not os.path.exists(module_path):
            raise Exception(f"Module path does not exist: {module_path}")

        spec = importlib.util.spec_from_file_location("plugin_module", module_path)
        if spec is None:
            raise Exception(f"Could not load module from '{module_path}'.")

        module = importlib.util.module_from_spec(spec)
        sys.modules["plugin_module"] = module

        if spec.loader is None:
            raise Exception(f"Could not load module from '{module_path}'.")

        spec.loader.exec_module(module)
        return self.find_plugin_constructor(module)

    def find_plugin_constructor(self, module: ModuleType) -> Any:
        if hasattr(module, "__main__"):
            main_func = module.__main__
            if callable(main_func):
                plugin_base_class = main_func()
                if isinstance(plugin_base_class, type):
                    return plugin_base_class
                else:
                    raise Exception("Plugin's __main__ must return a plugin constructor.")
            else:
                raise Exception("Plugin's __main__ is not callable.")

        else:
            raise Exception("Plugin does not have a __main__ function.")


def run_loop(main: Coroutine[Any, Any, None], logger: LoggerService) -> None:
    if sys.platform != "win32" and os.environ.get("CAMERA_UI_PYTHON_UVLOOP") == "1":
        try:
            # imported after inject_into_ssl: uvloop caches ssl.SSLContext at import
            import uvloop  # type: ignore[import-not-found]
        except ImportError:
            logger.warn("CAMERA_UI_PYTHON_UVLOOP is set but uvloop is not installed, using asyncio")
        else:
            logger.debug(f"Event loop: uvloop {uvloop.__version__}")
            uvloop.run(main)
            return
    asyncio.run(main)


if __name__ == "__main__":
    plugin_child = PluginChild()
    run_loop(plugin_child.run(), plugin_child.logger)
