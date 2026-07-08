from __future__ import annotations

import asyncio
import json
import time
from typing import TYPE_CHECKING, Any, Literal, cast

from lmdbm import Lmdb

from plugins.runtime.python.store import write_store_file

if TYPE_CHECKING:
    from pathlib import Path

    from plugins.runtime.python.store import StoreLogger


class JsonLmdb(Lmdb[Literal["config"], dict[str, Any]]):
    def _pre_key(self, key: Literal["config"]) -> bytes:
        return key.encode("utf-8")

    def _post_key(self, key: bytes) -> Literal["config"]:
        _key: Any = key.decode("utf-8")
        return _key

    def _pre_value(self, value: dict[str, Any]) -> bytes:
        return json.dumps(value).encode("utf-8")

    def _post_value(self, value: bytes) -> dict[str, Any]:
        return json.loads(value.decode("utf-8"))


def needs_lmdbm_migration(volume_dir: Path, store_path: Path) -> bool:
    return not store_path.exists() and (volume_dir / "data.mdb").exists()


async def migrate_legacy_lmdbm(volume_dir: Path, store_path: Path, log: StoreLogger) -> None:
    start = time.perf_counter()

    def read_legacy_config() -> dict[str, Any] | None:
        legacy_db = cast(
            "Lmdb[Literal['config'], dict[str, Any]]",
            JsonLmdb.open(file=str(volume_dir), flag="c"),
        )
        try:
            return cast("dict[str, Any] | None", legacy_db.get("config"))
        finally:
            legacy_db.close()

    config = await asyncio.to_thread(read_legacy_config)

    if not config:
        return

    await write_store_file(str(store_path), config, log)
    log.warn(
        f"store: migrated legacy lmdbm env {volume_dir} -> {store_path} "
        f"({len(config)} top-level keys) in {(time.perf_counter() - start) * 1000:.1f}ms"
    )
