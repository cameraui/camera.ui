import asyncio
from typing import Any, Literal, Protocol


class PluginConfigStoreRPC(Protocol):
    async def get(self) -> dict[str, Any] | None: ...

    async def put(self, config: dict[str, Any]) -> None: ...


class PluginConfigDb(Protocol):
    def get(self, key: Literal["config"]) -> dict[str, Any] | None: ...

    def update(self, mapping: dict[Literal["config"], dict[str, Any]], /) -> None: ...

    def close(self) -> None: ...


class RemotePluginConfigDb:
    def __init__(self, store: PluginConfigStoreRPC) -> None:
        self._store = store
        self._cache: dict[str, Any] = {}

    async def init(self) -> None:
        self._cache = (await self._store.get()) or {}

    def get(self, _key: Literal["config"]) -> dict[str, Any]:
        return self._cache

    def update(self, mapping: dict[Literal["config"], dict[str, Any]], /) -> None:
        config = mapping["config"]
        self._cache = config
        # Lmdb-compatible sync signature — persistence is fire-and-forget; the
        # cache is already current and errors only cost durability of this write.
        task = asyncio.create_task(self._persist(dict(config)))
        task.add_done_callback(lambda t: t.exception())

    def close(self) -> None:
        return None

    async def _persist(self, config: dict[str, Any]) -> None:
        await self._store.put(config)
