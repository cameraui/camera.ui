from __future__ import annotations

import asyncio
import contextlib
import time
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass

from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient, RPCMethod
from _camera_ui_tools.camera_ui_sdk import PipeDownloadSource
from plugins.runtime.python.namespaces import NamespaceManager

# the transport takes 4 MB per message and other calls share the connection, smaller chunks cost more CPU per byte
PIPE_CHUNK_SIZE = 1024 * 1024
# a slow source does not hold its bytes back until a chunk is full
PIPE_FLUSH = 0.05
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

        chunks = fill_chunks(pipe.source())
        lease = asyncio.create_task(self.__end_abandoned(pipe_id, pipe, chunks))
        try:
            async for chunk in chunks:
                pipe.waiting = True
                yield chunk
                pipe.waiting = False
                pipe.heard = time.monotonic()
        finally:
            lease.cancel()
            self.__pipes.pop(pipe_id, None)
            await chunks.aclose()

    @RPCMethod
    async def pipeState(self, pipe_id: str) -> str:
        pipe = self.__pipes.get(pipe_id)
        if pipe is None:
            return "gone"
        pipe.heard = time.monotonic()
        return "waiting" if pipe.waiting else "writing"

    async def __end_abandoned(self, pipe_id: str, pipe: Pipe, chunks: AsyncGenerator[bytes, None]) -> None:
        # a host that stopped asking never resumes the generator above, so the source is closed from here
        while not pipe.waiting or time.monotonic() - pipe.heard <= self.__lease:
            await asyncio.sleep(self.__lease / 4)
        self.__pipes.pop(pipe_id, None)
        await chunks.aclose()


async def fill_chunks(source: AsyncIterator[bytes]) -> AsyncGenerator[bytes, None]:
    parts: list[bytes] = []
    size = 0
    since = 0.0
    read: asyncio.Future[bytes] | None = None

    def take() -> bytes:
        nonlocal parts, size
        chunk = parts[0] if len(parts) == 1 else b"".join(parts)
        parts, size = [], 0
        return chunk

    try:
        while True:
            # checked here too, a source that is always ready would never run into the timeout
            if size > 0 and time.monotonic() - since >= PIPE_FLUSH:
                yield take()
                continue
            if read is None:
                read = asyncio.ensure_future(source.__anext__())
            if size > 0:
                await asyncio.wait({read}, timeout=max(since + PIPE_FLUSH - time.monotonic(), 0))
                if not read.done():
                    yield take()
                    continue
            try:
                chunk = await read
            except StopAsyncIteration:
                break
            read = None

            offset = 0
            if size > 0:
                offset = min(len(chunk), PIPE_CHUNK_SIZE - size)
                parts.append(chunk[:offset])
                size += offset
                if size == PIPE_CHUNK_SIZE:
                    yield take()
            while len(chunk) - offset >= PIPE_CHUNK_SIZE:
                yield chunk[offset : offset + PIPE_CHUNK_SIZE]
                offset += PIPE_CHUNK_SIZE
            if offset < len(chunk):
                parts.append(chunk[offset:])
                size = len(chunk) - offset
                since = time.monotonic()
        if size > 0:
            yield take()
    finally:
        if read is not None and not read.done():
            read.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await read
        close = getattr(source, "aclose", None)
        if close is not None:
            await close()
