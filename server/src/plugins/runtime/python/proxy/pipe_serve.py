from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass

from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient, RPCMethod
from _camera_ui_tools.camera_ui_sdk import PipeDownloadSource
from plugins.runtime.python.namespaces import NamespaceManager

# the transport takes 4 MB per message and other calls share the connection, smaller chunks cost more CPU per byte
PIPE_CHUNK_SIZE = 1024 * 1024
# the host asks about a running download every 15 s
PIPE_LEASE = 60.0


@dataclass
class Pipe:
    source: PipeDownloadSource
    expire: asyncio.TimerHandle
    running: bool = False
    waiting: bool = False
    heard: float = 0.0


class PluginPipeServer:
    def __init__(self, proxy: RPCClient, plugin_id: str, lease: float = PIPE_LEASE) -> None:
        self.__proxy = proxy
        self.__plugin_id = plugin_id
        self.__lease = lease
        self.__pipes: dict[str, Pipe] = {}
        self.__close_handler: CloseHandler | None = None

    async def register(self) -> None:
        subject = NamespaceManager.plugin_pipe_rpc(self.__plugin_id)
        self.__close_handler = await self.__proxy.register_handler(subject, self)

    async def close(self) -> None:
        if self.__close_handler:
            await self.__close_handler()
            self.__close_handler = None

    def add(self, source: PipeDownloadSource, ttl_ms: int) -> str:
        pipe_id = uuid.uuid4().hex
        expire = asyncio.get_running_loop().call_later(ttl_ms / 1000, self.__pipes.pop, pipe_id, None)
        self.__pipes[pipe_id] = Pipe(source, expire)
        return pipe_id

    def drop(self, pipe_id: str) -> None:
        pipe = self.__pipes.pop(pipe_id, None)
        if pipe:
            pipe.expire.cancel()

    @RPCMethod
    async def pullPipe(self, pipe_id: str) -> AsyncGenerator[bytes, None]:
        pipe = self.__pipes.get(pipe_id)
        if pipe is None or pipe.running:
            raise ValueError(f"download {pipe_id} not found or expired")
        pipe.running = True
        pipe.heard = time.monotonic()
        pipe.expire.cancel()

        source = pipe.source()
        lease = asyncio.create_task(self.__end_abandoned(pipe_id, pipe, source))
        try:
            async for chunk in source:
                for offset in range(0, len(chunk), PIPE_CHUNK_SIZE):
                    pipe.waiting = True
                    yield chunk[offset : offset + PIPE_CHUNK_SIZE]
                    pipe.waiting = False
                    pipe.heard = time.monotonic()
        finally:
            lease.cancel()
            self.__pipes.pop(pipe_id, None)

    @RPCMethod
    async def pipeState(self, pipe_id: str) -> str:
        pipe = self.__pipes.get(pipe_id)
        if pipe is None:
            return "gone"
        pipe.heard = time.monotonic()
        return "waiting" if pipe.waiting else "writing"

    async def __end_abandoned(self, pipe_id: str, pipe: Pipe, source: AsyncIterator[bytes]) -> None:
        # a host that stopped asking never resumes the generator above, so the source is closed from here
        while not pipe.waiting or time.monotonic() - pipe.heard <= self.__lease:
            await asyncio.sleep(self.__lease / 4)
        self.__pipes.pop(pipe_id, None)
        close = getattr(source, "aclose", None)
        if close is not None:
            await close()
