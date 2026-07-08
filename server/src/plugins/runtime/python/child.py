from __future__ import annotations

import truststore

truststore.inject_into_ssl()

import asyncio
import importlib.util
import os
import sys
from contextlib import suppress
from pathlib import Path
from types import ModuleType
from typing import Any, cast

import setproctitle

from _camera_ui_tools.camera_ui_common import (
    LoggerOptions,
    LoggerService,
    SignalHandler,
)
from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient, create_rpc_client
from _camera_ui_tools.camera_ui_sdk import API_EVENT, BasePlugin, Camera
from _camera_ui_tools.camera_ui_sdk import CameraDevice as CameraDeviceInterface
from plugins.runtime.python.config_db import (
    LocalPluginConfigDb,
    PluginConfigDb,
    PluginConfigStoreRPC,
    RemotePluginConfigDb,
)
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.plugin_api import PluginAPI
from plugins.runtime.python.proxy.camera_device import CameraDeviceProxy
from plugins.runtime.python.proxy.file_serve import PluginFileServer
from plugins.runtime.python.store import STORE_FILE_NAME, PluginStoreFile
from plugins.runtime.python.store_migrate import migrate_legacy_lmdbm, needs_lmdbm_migration
from plugins.runtime.python.typings import (
    PLUGIN_COMMAND,
    PLUGIN_STATUS,
    PluginInfo,
    ProcessLoadMessage,
    ProcessMessage,
    ProcessResponse,
)

process_name = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1] if len(sys.argv) > 1 else "Plugin"
setproctitle.setproctitle(f"camera.ui - {process_name}")

RPC_TEARDOWN_TIMEOUT = 0.5


class PluginChild:
    def __init__(self) -> None:
        self.proxy: RPCClient = create_rpc_client(
            {
                "name": NamespaceManager.plugin_namespaces(os.environ["PLUGIN_ID"]).plugin_child,
                "servers": os.environ["PROXY_ENDPOINTS"].split(","),
                "auth": {
                    "user": os.environ["PROXY_USER"],
                    "password": os.environ["PROXY_PASSWORD"],
                },
            }
        )

        for key in ["PROXY_USER", "PROXY_PASSWORD", "PROXY_ENDPOINTS", "PROXY_CERT", "PROXY_KEY", "PROXY_CA"]:
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
        self.close_proxy: CloseHandler | None = None
        self.file_server: PluginFileServer | None = None
        self.plugin_db: PluginConfigDb | None = None

        self.stopped = False

        self.signal_handler = SignalHandler(
            {
                "display_name": "[Signal]",
                "timeout_duration": 2,
                "logger": self.logger,
                "close_function": self.stop_plugin,
            }
        )

    async def run(self) -> None:
        try:
            self.signal_handler.setup_handlers()
            await self.proxy.connect()
            await self.on_start()
            await self.signal_handler.shutdown_event.wait()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.logger.error(f"Failed to connect to proxy server: {e}")
            raise
        finally:
            await self.stop_plugin()

    async def on_start(self) -> None:
        self.channel = await self.proxy.private_channel("plugin-communication", "camera.ui")
        self.channel.on("message", self.on_message)
        await self.send_message({"type": PLUGIN_STATUS.READY.value})

    async def start_plugin(self, data: ProcessLoadMessage) -> None:
        try:
            # Host-local writable dir — on a remote worker the master's path from
            # the START message would point at the wrong machine.
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

            plugin_constructor = self.load_plugin()
            plugin_storage = await self.api.storage_controller.createStorage("plugin")
            self.plugin = cast(BasePlugin, plugin_constructor(self.logger, self.api, plugin_storage))

            if hasattr(self.plugin, "storage_schema") and self.plugin.storage_schema:
                plugin_storage.defineSchemas(self.plugin.storage_schema)

            namespaces = NamespaceManager.plugin_namespaces(plugin_info["id"])
            self.close_proxy = await self.proxy.register_handler(
                namespaces.plugin_child_rpc, self.plugin, without_decorators=True
            )

            # Remote-hosted: serve this worker's files so the master can stream
            # downloads/exports of them.
            if os.environ.get("PLUGIN_REMOTE_MODE"):
                self.file_server = PluginFileServer(self.proxy, plugin_info["id"])
                await self.file_server.register()

            self.api.device_manager.set_plugin(self.plugin)

            await self.api.device_manager.init()
            await self.api.core_manager.init()
            await self.configure_cameras(self.api, plugin_info, cameras)

            await self.send_message({"type": PLUGIN_STATUS.STARTED.value})

            await asyncio.sleep(0.1)

            self.api.emit(API_EVENT.FINISH_LAUNCHING)
        except Exception as e:
            await self.send_message({"type": PLUGIN_STATUS.ERROR.value, "error": str(e)})

    async def stop_plugin(self) -> None:
        if self.stopped:
            return

        self.stopped = True

        if self.api:
            completed = await self.api.emit_and_wait(
                API_EVENT.SHUTDOWN.value,
                timeout=1.0,
                on_error=lambda e: self.logger.error(f"Shutdown listener failed: {e}"),
            )
            if not completed:
                self.logger.warn("Shutdown listeners still pending after 1s, continuing teardown")

            await self.api.device_manager.close()
            await self.api.core_manager.close()
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
        await self.channel.send(message)

    async def on_message(self, message: ProcessMessage) -> None:
        if self.stopped:
            return

        match message["type"]:
            case PLUGIN_COMMAND.START.value:
                if not message["data"]:
                    await self.send_message({"type": PLUGIN_STATUS.ERROR.value, "error": "No data provided"})
                    return

                await self.start_plugin(message["data"])
            case PLUGIN_COMMAND.STOP.value:
                await self.stop_plugin()
            case _:
                pass

    async def configure_plugin_db(self, storage_path: str, plugin_id: str) -> PluginConfigDb:
        # Remote-hosted: config lives on the master (re-homing safe) — persist
        # through its config store instead of a worker-local file.
        if os.environ.get("PLUGIN_CONFIG_STORE_RPC"):
            namespaces = NamespaceManager.plugin_namespaces(plugin_id)
            store_rpc = self.proxy.create_proxy(namespaces.plugin_config_store_rpc, PluginConfigStoreRPC)
            remote_db = RemotePluginConfigDb(store_rpc)
            await remote_db.init()
            return remote_db

        volume_dir = Path(storage_path) / "volume"
        store_path = volume_dir / STORE_FILE_NAME

        if await asyncio.to_thread(needs_lmdbm_migration, volume_dir, store_path):
            await migrate_legacy_lmdbm(volume_dir, store_path, self.logger)

        store = PluginStoreFile(str(volume_dir), plugin_id, self.logger)
        await store.open()
        return LocalPluginConfigDb(store)

    async def configure_cameras(self, api: PluginAPI, plugin_info: PluginInfo, cameras: list[Camera]) -> None:
        cameras_devices: list[CameraDeviceProxy] = []

        for camera in cameras:
            camera_logger = self.logger.create_logger(
                {"suffix": camera["name"], "target_id": camera["_id"], "target_type": "camera"}
            )
            cameras_devices.append(
                CameraDeviceProxy(
                    self.proxy,
                    api.storage_controller,
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


if __name__ == "__main__":
    plugin_child = PluginChild()
    asyncio.run(plugin_child.run())
