from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Protocol

if TYPE_CHECKING:
    from plugins.runtime.python.store import PluginStoreFile


class PluginConfigStoreRPC(Protocol):
    async def get(self) -> dict[str, Any] | None: ...

    async def put(self, config: dict[str, Any]) -> None: ...


class PluginConfigDb(Protocol):
    def get(self, key: Literal["config"], /) -> dict[str, Any] | None: ...

    async def put(self, key: Literal["config"], value: dict[str, Any], /) -> None: ...

    async def close(self) -> None: ...


class LocalPluginConfigDb:
    def __init__(self, store: PluginStoreFile) -> None:
        self._store = store

    def get(self, key: Literal["config"], /) -> dict[str, Any]:
        return self._store.get()

    async def put(self, key: Literal["config"], value: dict[str, Any], /) -> None:
        await self._store.put(value)

    async def close(self) -> None:
        await self._store.close()


class RemotePluginConfigDb:
    def __init__(self, store: PluginConfigStoreRPC) -> None:
        self._store = store
        self._cache: dict[str, Any] = {}

    async def init(self) -> None:
        self._cache = (await self._store.get()) or {}

    def get(self, key: Literal["config"], /) -> dict[str, Any]:
        return self._cache

    async def put(self, key: Literal["config"], value: dict[str, Any], /) -> None:
        self._cache = value
        await self._store.put(value)

    async def close(self) -> None:
        return None
