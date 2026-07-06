from __future__ import annotations

import os
from typing import cast

from _camera_ui_tools.camera_ui_rpc import RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    CreateDownloadOptions,
    CreateStreamDownloadOptions,
    DownloadManager,
    DownloadToken,
)
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.rpc.typings import DownloadManagerInterface


class DownloadManagerProxy(DownloadManager):
    def __init__(self, proxy: RPCClient) -> None:
        self.__proxy = proxy
        self.__namespaces = NamespaceManager.download_manager_namespaces()
        # Remote-hosted plugins tag downloads so the master pulls the file back
        # from this worker over PluginFileServe instead of serving it locally.
        self.__remote_plugin_id = (
            os.environ.get("PLUGIN_ID") if os.environ.get("PLUGIN_REMOTE_MODE") else None
        )

    @property
    def __download_manager_proxy(self) -> DownloadManagerInterface:
        return self.__proxy.create_proxy(
            self.__namespaces.download_manager_rpc,
            DownloadManagerInterface,
        )

    async def createDownload(self, options: CreateDownloadOptions) -> DownloadToken:
        payload = cast(CreateDownloadOptions, {**options, "remotePluginId": self.__remote_plugin_id})
        return await self.__download_manager_proxy.createDownload(payload)

    async def createStreamDownload(self, options: CreateStreamDownloadOptions) -> DownloadToken:
        payload = cast(CreateStreamDownloadOptions, {**options, "remotePluginId": self.__remote_plugin_id})
        return await self.__download_manager_proxy.createStreamDownload(payload)

    async def deleteDownload(self, token: str) -> None:
        return await self.__download_manager_proxy.deleteDownload(token)
