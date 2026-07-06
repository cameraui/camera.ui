from __future__ import annotations

import os
from contextlib import suppress
from typing import TypedDict

from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient, RPCMethod
from plugins.runtime.python.namespaces import NamespaceManager


class FileServeStat(TypedDict):
    exists: bool
    size: int


class PluginFileServer:
    def __init__(self, proxy: RPCClient, plugin_id: str) -> None:
        self.__proxy = proxy
        self.__plugin_id = plugin_id
        self.__close_handler: CloseHandler | None = None

    async def register(self) -> None:
        subject = NamespaceManager.plugin_file_serve_rpc(self.__plugin_id)
        self.__close_handler = await self.__proxy.register_handler(subject, self)

    async def close(self) -> None:
        if self.__close_handler:
            await self.__close_handler()
            self.__close_handler = None

    @RPCMethod
    async def statFile(self, file_path: str) -> FileServeStat:
        try:
            if not os.path.isfile(file_path):
                return {"exists": False, "size": 0}
            return {"exists": True, "size": os.path.getsize(file_path)}
        except OSError:
            return {"exists": False, "size": 0}

    @RPCMethod
    async def readFileChunk(self, file_path: str, offset: int, length: int) -> bytes:
        with open(file_path, "rb") as f:
            f.seek(offset)
            return f.read(length)

    @RPCMethod
    async def deleteFile(self, file_path: str) -> None:
        with suppress(OSError):
            os.remove(file_path)
