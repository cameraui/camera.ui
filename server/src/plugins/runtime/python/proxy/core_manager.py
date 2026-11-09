from __future__ import annotations

import asyncio
import os
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from _camera_ui_tools.camera_ui_common import LoggerService
from _camera_ui_tools.camera_ui_rpc import CloseHandler, ProxyWithClose, RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    BasePlugin,
    CoreManager,
    CoreManagerEvent,
    Observable,
    PluginInterface,
    Subject,
)
from _camera_ui_tools.camera_ui_sdk.manager import (
    AssistantAccess,
    AssistantAskRequest,
    AssistantAskResult,
)
from plugins.runtime.python.namespaces import (
    CoreManagerNamespaces,
    NamespaceManager,
    PluginNamespaces,
)
from plugins.runtime.python.rpc.typings import CoreManagerInterface
from plugins.runtime.python.typings import PluginInfo

if TYPE_CHECKING:
    from _camera_ui_tools.camera_ui_sdk import PluginCallOptions


def _proxy_call_options(options: PluginCallOptions | None) -> dict[str, Any]:
    if not options:
        return {}
    call_options: dict[str, Any] = {}
    timeout_ms = options.get("timeoutMs")
    if timeout_ms and timeout_ms > 0:
        call_options["timeout"] = timeout_ms
    if options.get("noRetry"):
        call_options["no_responder_retry"] = {"max_retries": 0}
    return call_options


class CoreManagerProxy(CoreManager):
    def __init__(
        self,
        proxy: RPCClient,
        logger: LoggerService,
        plugin: PluginInfo,
    ):
        self.__initialized = False

        self.__proxy = proxy
        self.__logger = logger
        self.__plugin = plugin
        self.__close_subscription: CloseHandler | None = None

        self.__namespaces: tuple[CoreManagerNamespaces, PluginNamespaces] = (
            NamespaceManager.core_manager_namespaces(),
            NamespaceManager.plugin_namespaces(self.__plugin["id"]),
        )

        self.__rpc_connections: dict[str, ProxyWithClose[BasePlugin]] = {}
        self.__call_proxies: dict[str, BasePlugin] = {}
        self.__event_subject: Subject[CoreManagerEvent] = Subject()

    @property
    def __core_manager_proxy(self) -> CoreManagerInterface:
        return self.__proxy.create_proxy(
            self.__namespaces[0].core_manager_rpc,
            CoreManagerInterface,
        )

    @property
    def onEvent(self) -> Observable[CoreManagerEvent]:
        return self.__event_subject.as_observable()

    async def init(self) -> None:
        if self.__initialized:
            return

        self.__initialized = True
        self.__close_subscription = await self.__proxy.subscribe(
            self.__namespaces[0].core_manager_subject,
            self.__on_event_message,
        )

    async def connectToPlugin(
        self, pluginName: str, options: PluginCallOptions | None = None
    ) -> BasePlugin | None:
        try:
            plugin = await self.__core_manager_proxy.getPlugin(pluginName)

            if not plugin:
                return None

            namespace = NamespaceManager.plugin_namespaces(plugin["id"]).plugin_child_rpc
            rpc_connection = self.__rpc_connections.get(namespace)
            if rpc_connection is None:
                # the isolated overload rejects an abstract type_class such as BasePlugin
                create_proxy: Callable[..., ProxyWithClose[BasePlugin]] = self.__proxy.create_proxy
                rpc_connection = create_proxy(namespace, BasePlugin, isolated_connection=True)
                self.__rpc_connections[namespace] = rpc_connection

            call_options = _proxy_call_options(options)
            if not call_options:
                return rpc_connection.proxy

            key = f"{namespace}|{call_options.get('timeout', '')}|{'no_responder_retry' in call_options}"
            call_proxy = self.__call_proxies.get(key)
            if call_proxy is None:
                # option sets share the plain proxy's isolated client
                client: RPCClient = getattr(rpc_connection.proxy, "_isolated_client", self.__proxy)
                call_proxy = client.create_proxy(namespace, BasePlugin, **call_options)
                self.__call_proxies[key] = call_proxy
            return call_proxy
        except Exception as e:
            self.__logger.error(f'Could not connect to plugin "{pluginName}": {e}')
            return None

    async def getFFmpegPath(self) -> str:
        # on a worker the master's ffmpeg path is wrong, the worker injects its own
        ffmpeg_path = os.environ.get("CAMERAUI_FFMPEG_PATH")
        if ffmpeg_path:
            return ffmpeg_path
        return await self.__core_manager_proxy.getFFmpegPath()

    async def getServerAddresses(self) -> list[str]:
        return await self.__core_manager_proxy.getServerAddresses(self.__plugin["id"])

    async def getCloudServerId(self) -> str:
        return await self.__core_manager_proxy.getCloudServerId()

    async def getRestoreGeneration(self) -> str:
        return await self.__core_manager_proxy.getRestoreGeneration()

    async def getInstanceId(self) -> str:
        return await self.__core_manager_proxy.getInstanceId()

    async def getLanguage(self) -> str:
        return await self.__core_manager_proxy.getLanguage()

    async def getPluginsByInterface(self, interfaceName: PluginInterface) -> list[PluginInfo]:
        return await self.__core_manager_proxy.getPluginsByInterface(interfaceName)

    async def assistantAsk(self, request: AssistantAskRequest) -> AssistantAskResult:
        return await self.__core_manager_proxy.assistantAsk({**request, "pluginId": self.__plugin["id"]})

    async def assistantAccess(self) -> AssistantAccess:
        return await self.__core_manager_proxy.assistantAccess(self.__plugin["id"])

    async def close(self) -> None:
        self.__initialized = False
        self.__event_subject.complete()

        if self.__close_subscription:
            await self.__close_subscription()
            self.__close_subscription = None
        await self.__disconnect_rpc()

    async def __on_event_message(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if not event_type:
            return
        data = event.get("data")
        self.__event_subject.next({"type": event_type, "data": data})

    async def __disconnect_rpc(self) -> None:
        rpc_connections = list(self.__rpc_connections.values())
        self.__rpc_connections.clear()
        self.__call_proxies.clear()
        await asyncio.gather(
            *[rpc_connection.close() for rpc_connection in rpc_connections], return_exceptions=True
        )
