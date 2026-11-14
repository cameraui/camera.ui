from __future__ import annotations

import os
from typing import cast

from _camera_ui_tools.camera_ui_rpc import RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    CreateDownloadOptions,
    CreatePipeDownloadOptions,
    CreateStreamDownloadOptions,
    DownloadManager,
    DownloadToken,
    PipeDownloadSource,
)
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.proxy.pipe_serve import PluginPipeServer
from plugins.runtime.python.rpc.typings import DownloadManagerInterface
from plugins.runtime.python.typings import PluginInfo

DEFAULT_PIPE_TTL_MS = 10 * 60 * 1000


class DownloadManagerProxy(DownloadManager):
    def __init__(self, proxy: RPCClient, plugin: PluginInfo) -> None:
        self.__proxy = proxy
        self.__namespaces = NamespaceManager.download_manager_namespaces()
        self.__plugin_id = plugin["id"]
        self.__pipes = PluginPipeServer(proxy, plugin["id"])
        self.__remote_plugin_id = (
            os.environ.get("PLUGIN_ID") if os.environ.get("PLUGIN_REMOTE_MODE") else None
        )

    @property
    def __download_manager_proxy(self) -> DownloadManagerInterface:
        return self.__proxy.create_proxy(
            self.__namespaces.download_manager_rpc,
            DownloadManagerInterface,
        )

    async def init(self) -> None:
        await self.__pipes.register()

    async def close(self) -> None:
        await self.__pipes.close()

    async def createDownload(self, options: CreateDownloadOptions) -> DownloadToken:
        payload = cast(CreateDownloadOptions, {**options, "remotePluginId": self.__remote_plugin_id})
        return await self.__download_manager_proxy.createDownload(payload)

    async def createStreamDownload(self, options: CreateStreamDownloadOptions) -> DownloadToken:
        payload = cast(CreateStreamDownloadOptions, {**options, "remotePluginId": self.__remote_plugin_id})
        return await self.__download_manager_proxy.createStreamDownload(payload)

    async def createPipeDownload(
        self, options: CreatePipeDownloadOptions, source: PipeDownloadSource
    ) -> DownloadToken:
        pipe_id = self.__pipes.add(source, options.get("ttlMs", DEFAULT_PIPE_TTL_MS))
        payload = cast(
            CreatePipeDownloadOptions, {**options, "pluginId": self.__plugin_id, "pipeId": pipe_id}
        )
        try:
            return await self.__download_manager_proxy.createPipeDownload(payload)
        except BaseException:
            self.__pipes.drop(pipe_id)
            raise

    async def deleteDownload(self, token: str) -> None:
        return await self.__download_manager_proxy.deleteDownload(token)
