from __future__ import annotations

import asyncio
import os
from typing import TYPE_CHECKING, Any, TypedDict

from _camera_ui_tools.camera_ui_common import LoggerService
from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    API_EVENT,
    BasePlugin,
    CoreManager,
    CoreManagerEvent,
    Observable,
    PluginInterface,
    Subject,
)
from plugins.runtime.python.namespaces import CoreManagerNamespaces, NamespaceManager, PluginNamespaces
from plugins.runtime.python.rpc.typings import CoreManagerInterface
from plugins.runtime.python.typings import PluginInfo

if TYPE_CHECKING:
    from plugins.runtime.python.plugin_api import PluginAPI


class RPCConnection(TypedDict):
    proxy: BasePlugin
    close: CloseHandler


class CoreManagerProxy(CoreManager):
    def __init__(
        self,
        proxy: RPCClient,
        api: PluginAPI,
        logger: LoggerService,
        plugin: PluginInfo,
    ):
        self.__initialized = False

        self.__api: PluginAPI = api
        self.__proxy = proxy
        self.__logger = logger
        self.__plugin = plugin
        self.__close_subscription: CloseHandler | None = None

        self.__namespaces: tuple[CoreManagerNamespaces, PluginNamespaces] = (
            NamespaceManager.core_manager_namespaces(),
            NamespaceManager.plugin_namespaces(self.__plugin["id"]),
        )

        self.__rpc_connections: dict[str, RPCConnection] = {}
        self.__event_subject: Subject[CoreManagerEvent] = Subject()

        self.__api.once(API_EVENT.SHUTDOWN.value, self.__close)

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

    async def connectToPlugin(self, pluginName: str) -> BasePlugin | None:
        try:
            plugin = await self.__core_manager_proxy.getPlugin(pluginName)

            if not plugin:
                return None

            namespaces = NamespaceManager.plugin_namespaces(plugin["id"])

            rpc_connection: RPCConnection

            if namespaces.plugin_child_rpc in self.__rpc_connections:
                rpc_connection = self.__rpc_connections[namespaces.plugin_child_rpc]
            else:
                rpc_connection = await self.__proxy.create_proxy(namespaces.plugin_child_rpc)
                self.__rpc_connections[namespaces.plugin_child_rpc] = rpc_connection
            return rpc_connection["proxy"]
        except Exception:
            return None

    async def getFFmpegPath(self) -> str:
        # Remote-hosted: the master's path points at the wrong machine - the
        # worker injects its own bundled ffmpeg at spawn time.
        ffmpeg_path = os.environ.get("CAMERAUI_FFMPEG_PATH")
        if ffmpeg_path:
            return ffmpeg_path
        return await self.__core_manager_proxy.getFFmpegPath()

    async def getServerAddresses(self) -> list[str]:
        return await self.__core_manager_proxy.getServerAddresses()

    async def getCloudServerId(self) -> str:
        return await self.__core_manager_proxy.getCloudServerId()

    async def getPluginsByInterface(self, interfaceName: PluginInterface) -> list[PluginInfo]:
        return await self.__core_manager_proxy.getPluginsByInterface(interfaceName)

    async def __on_event_message(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if not event_type:
            return
        data = event.get("data")
        self.__event_subject.next({"type": event_type, "data": data})

    async def __close(self) -> None:
        self.__initialized = False
        self.__event_subject.complete()
        self.__api.removeListener(API_EVENT.SHUTDOWN.value, self.__close)
        if self.__close_subscription:
            await self.__close_subscription()
            self.__close_subscription = None
        await self.__disconnect_rpc()

    async def __disconnect_rpc(self) -> None:
        await asyncio.gather(
            *[rpc_connection["close"]() for rpc_connection in self.__rpc_connections.values()]
        )
