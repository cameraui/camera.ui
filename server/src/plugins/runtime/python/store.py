from __future__ import annotations

import asyncio
import math
import os
import shutil
import sys
import time
import zlib
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

import msgpack

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

STORE_FILE_NAME = "store.cui"

_MAGIC = b"CUI1"
_MAX_SAFE_INTEGER = 2**53 - 1
_RENAME_RETRY_DELAYS_MS = (10, 25, 60, 150, 300)
_IS_WINDOWS = sys.platform == "win32"


class StoreLogger(Protocol):
    def debug(self, message: str, /) -> None: ...

    def warn(self, message: str, /) -> None: ...

    def error(self, message: str, /) -> None: ...


class StoreCorruptError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(f"store envelope: {message}")


def encode_envelope(payload: dict[str, Any]) -> bytes:
    body: bytes = msgpack.packb(payload, use_bin_type=True)
    return _MAGIC + body + zlib.crc32(body).to_bytes(4, "little")


def decode_envelope(buf: bytes) -> dict[str, Any]:
    if len(buf) < len(_MAGIC) + 4 or buf[: len(_MAGIC)] != _MAGIC:
        raise StoreCorruptError("bad magic")

    body = buf[len(_MAGIC) : -4]
    if zlib.crc32(body) != int.from_bytes(buf[-4:], "little"):
        raise StoreCorruptError("crc mismatch")

    try:
        payload = msgpack.unpackb(body, raw=False, strict_map_key=False)
    except Exception as error:
        raise StoreCorruptError(f"payload decode failed: {error}") from error

    if not isinstance(payload, dict):
        raise StoreCorruptError("payload is not a map")

    return payload


def _replace_with_retry(tmp_path: str, path: str) -> None:
    for attempt, delay_ms in enumerate(_RENAME_RETRY_DELAYS_MS):
        try:
            os.replace(tmp_path, path)
            return
        except PermissionError:
            # Windows AV scanners / the search indexer transiently hold the
            # rename target open; the error is retryable there within a small
            # budget (~0.5s total), nowhere else.
            if not _IS_WINDOWS or attempt >= len(_RENAME_RETRY_DELAYS_MS) - 1:
                raise
            time.sleep(delay_ms / 1000)


def _write_store_file_sync(path: str, buf: bytes) -> None:
    tmp_path = f"{path}.tmp-{os.getpid()}"
    try:
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
        try:
            os.write(fd, buf)
            os.fsync(fd)
        finally:
            os.close(fd)
        _replace_with_retry(tmp_path, path)
    except Exception:
        with suppress(OSError):
            os.unlink(tmp_path)
        raise


async def write_store_file(path: str, payload: dict[str, Any], log: StoreLogger | None = None) -> None:
    buf = encode_envelope(payload)

    try:
        await asyncio.to_thread(_write_store_file_sync, path, buf)
    except Exception as error:
        if log:
            log.error(f"store: write {path} failed: {error}")
        raise


def _read_bytes(path: str) -> bytes | None:
    try:
        return Path(path).read_bytes()
    except FileNotFoundError:
        return None


async def read_store_file(path: str, log: StoreLogger | None = None) -> dict[str, Any] | None:
    buf = await asyncio.to_thread(_read_bytes, path)
    if buf is None:
        return None

    try:
        payload = decode_envelope(buf)
        return payload
    except StoreCorruptError as error:
        if log:
            log.error(f"store: {path} is corrupt ({error}) — trying backup")

    bak_path = f"{path}.bak"
    try:
        bak_buf = await asyncio.to_thread(Path(bak_path).read_bytes)
    except OSError:
        bak_buf = None

    if bak_buf is not None:
        try:
            payload = decode_envelope(bak_buf)
        except StoreCorruptError as error:
            if log:
                log.error(f"store: backup {bak_path} is corrupt too ({error})")
        else:
            # Self-heal: replace the corrupt file immediately, otherwise the
            # next backup refresh would clobber the only good copy.
            await asyncio.to_thread(_write_store_file_sync, path, bak_buf)
            if log:
                log.warn(f"store: recovered {path} from backup ({len(bak_buf)} bytes)")
            return payload

    # A corrupt store must never silently become an empty one - that would
    # wipe the plugin's persisted state. Recover from the backup generation or
    # fail the open loudly.
    raise StoreCorruptError(f"{path} unreadable and no usable backup")


def _backup_store_file_sync(path: str) -> None:
    # Copy to a temp sibling first - a crash mid-copy must never leave a
    # truncated .bak, it may be the only recovery generation.
    tmp_path = f"{path}.bak.tmp-{os.getpid()}"
    try:
        shutil.copyfile(path, tmp_path)
        _replace_with_retry(tmp_path, f"{path}.bak")
    except Exception:
        with suppress(OSError):
            os.unlink(tmp_path)
        raise


async def backup_store_file(path: str, log: StoreLogger | None = None) -> None:
    try:
        await asyncio.to_thread(_backup_store_file_sync, path)
    except FileNotFoundError:
        return
    except OSError as error:
        if log:
            log.warn(f"store: backup for {path} failed: {error}")
        return


class _PendingFlush:
    __slots__ = ("future", "snapshot")

    def __init__(self, snapshot: dict[str, Any], future: asyncio.Future[None]) -> None:
        self.snapshot = snapshot
        self.future = future


# Serializes flushes and collapses saves arriving mid-flush into one trailing
# flush of the latest snapshot. Snapshots are whole-document states, so the
# newest one contains every earlier caller's write - a burst of N saves costs
# at most 2 flushes without weakening the durability guarantee.
class CoalescingWriter:
    def __init__(
        self,
        flush: Callable[[dict[str, Any]], Awaitable[None]],
        log: StoreLogger | None = None,
    ) -> None:
        self._flush = flush
        self._log = log
        self._in_flight: asyncio.Task[None] | None = None
        self._pending: _PendingFlush | None = None

    def write(self, snapshot: dict[str, Any]) -> Awaitable[None]:
        if self._in_flight is None:
            self._in_flight = asyncio.ensure_future(self._run(snapshot))
            return self._in_flight

        if self._pending is not None:
            self._pending.snapshot = snapshot
            return self._pending.future

        self._pending = _PendingFlush(snapshot, asyncio.get_running_loop().create_future())
        return self._pending.future

    async def idle(self) -> None:
        while (in_flight := self._in_flight) is not None:
            try:
                await in_flight
            except asyncio.CancelledError:
                # Re-raise only our own cancellation; a cancelled flush task
                # must not abort the drain loop.
                if not in_flight.cancelled():
                    raise
            except Exception:
                pass

    async def _run(self, snapshot: dict[str, Any]) -> None:
        try:
            await self._flush(snapshot)
        finally:
            pending = self._pending
            self._pending = None

            if pending is not None:
                task = asyncio.ensure_future(self._run(pending.snapshot))
                task.add_done_callback(_settler(pending.future))
                self._in_flight = task
            else:
                self._in_flight = None


def _settler(future: asyncio.Future[None]) -> Callable[[asyncio.Task[None]], None]:
    # Every handed-out awaitable must settle no matter how the trailing flush
    # ends (success, error, or cancellation) - a pending future here would
    # hang its awaiting caller forever.
    def settle(task: asyncio.Task[None]) -> None:
        if future.done():
            return
        if task.cancelled():
            future.cancel()
        elif (error := task.exception()) is not None:
            future.set_exception(error)
        else:
            future.set_result(None)

    return settle


@dataclass(frozen=True)
class PluginLocation:
    pass


@dataclass(frozen=True)
class CameraLocation:
    camera_id: str


@dataclass(frozen=True)
class SensorLocation:
    camera_id: str
    sensor_type: str
    sensor_name: str


StoreLocation = PluginLocation | CameraLocation | SensorLocation


def read_location(config: dict[str, Any], location: StoreLocation) -> dict[str, Any] | None:
    if isinstance(location, PluginLocation):
        return config.get("plugin")
    if isinstance(location, CameraLocation):
        return (config.get("cameras") or {}).get(location.camera_id)
    by_camera = (config.get("sensors") or {}).get(location.camera_id) or {}
    return (by_camera.get(location.sensor_type) or {}).get(location.sensor_name)


def write_location(config: dict[str, Any], location: StoreLocation, values: dict[str, Any]) -> None:
    if isinstance(location, PluginLocation):
        config["plugin"] = values
        return
    if isinstance(location, CameraLocation):
        config.setdefault("cameras", {})[location.camera_id] = values
        return
    by_camera = config.setdefault("sensors", {}).setdefault(location.camera_id, {})
    by_camera.setdefault(location.sensor_type, {})[location.sensor_name] = values


def delete_location(config: dict[str, Any], location: StoreLocation) -> None:
    if isinstance(location, PluginLocation):
        config.pop("plugin", None)
        return

    if isinstance(location, CameraLocation):
        cameras = config.get("cameras")
        if isinstance(cameras, dict):
            cameras.pop(location.camera_id, None)
        _prune_if_empty(config, "cameras")
        return

    sensors = config.get("sensors")
    if not isinstance(sensors, dict):
        return
    by_camera = sensors.get(location.camera_id)
    if not isinstance(by_camera, dict):
        return
    by_type = by_camera.get(location.sensor_type)
    if not isinstance(by_type, dict):
        return

    by_type.pop(location.sensor_name, None)
    _prune_if_empty(by_camera, location.sensor_type)
    _prune_if_empty(sensors, location.camera_id)
    _prune_if_empty(config, "sensors")


def _prune_if_empty(parent: dict[str, Any], key: str) -> None:
    child = parent.get(key)
    if isinstance(child, dict) and not child:
        del parent[key]


_CANONICAL_SECTIONS = ("plugin", "cameras", "sensors")
_LEGACY_SENSOR_MARKER = ":sensor:"


def is_canonical_layout(payload: dict[str, Any]) -> bool:
    return all(key in _CANONICAL_SECTIONS for key in payload)


# Go-SDK legacy blobs ('<pluginId>.plugin', ...) are remapped by the Go SDK
# itself, not here: server and plugin update independently, and a plugin on
# an old SDK must keep finding its keys untouched.
def _is_go_legacy_layout(payload: dict[str, Any], plugin_id: str) -> bool:
    return len(payload) > 0 and all(key.startswith(f"{plugin_id}.") for key in payload)


def remap_legacy_layout(
    payload: dict[str, Any], plugin_id: str, log: StoreLogger | None = None
) -> dict[str, Any]:
    if is_canonical_layout(payload) or _is_go_legacy_layout(payload, plugin_id):
        return payload

    canonical: dict[str, Any] = {
        section: payload[section] for section in _CANONICAL_SECTIONS if section in payload
    }

    for key, values in payload.items():
        if key in _CANONICAL_SECTIONS:
            continue

        if key == "storage":
            # In a mixed legacy+canonical document the canonical section is the
            # newer write - the legacy duplicate is stale and must never win.
            if "plugin" in canonical:
                if log:
                    log.warn(
                        f"store: legacy key 'storage' dropped — canonical 'plugin' already present ({plugin_id})"
                    )
                continue
            canonical["plugin"] = values
            continue

        sensor_idx = key.find(_LEGACY_SENSOR_MARKER)
        if sensor_idx != -1:
            # <camId>:sensor:<type>:<pluginId>:<name> - type and pluginId contain
            # no colons; the name keeps everything after them verbatim.
            camera_id = key[:sensor_idx]
            rest = key[sensor_idx + len(_LEGACY_SENSOR_MARKER) :]
            type_end = rest.find(":")
            plugin_end = rest.find(":", type_end + 1)
            if type_end != -1 and plugin_end != -1:
                sensor_type = rest[:type_end]
                sensor_name = rest[plugin_end + 1 :]
                by_camera = canonical.setdefault("sensors", {}).setdefault(camera_id, {})
                if sensor_name in by_camera.get(sensor_type, {}):
                    if log:
                        log.warn(
                            f"store: legacy sensor key '{key}' dropped — canonical target already present ({plugin_id})"
                        )
                    continue
                by_camera.setdefault(sensor_type, {})[sensor_name] = values
                continue
            if log:
                log.warn(f"store: unparsable legacy sensor key '{key}' kept under cameras ({plugin_id})")

        if key in (canonical.get("cameras") or {}):
            if log:
                log.warn(
                    f"store: legacy key '{key}' dropped — canonical 'cameras.{key}' already present ({plugin_id})"
                )
            continue
        canonical.setdefault("cameras", {})[key] = values

    return canonical


# Values must round-trip identically through all three runtimes' msgpack
# codecs - anything outside the shared domain is refused up front.
def validate_store_value(key: str, value: Any) -> None:
    _walk_value(value, key, 0)


_MAX_VALUE_DEPTH = 64


def _walk_value(value: Any, path: str, depth: int) -> None:
    # Depth cap: rejects circular references (and absurd nesting) with a clear
    # error instead of a RecursionError.
    if depth > _MAX_VALUE_DEPTH:
        raise ValueError(
            f"store: value at '{path}' exceeds {_MAX_VALUE_DEPTH} nesting levels — circular reference?"
        )
    # bool is an int subclass, so it must be accepted before the int check.
    if value is None or isinstance(value, bool | str):
        return

    if isinstance(value, int):
        if abs(value) > _MAX_SAFE_INTEGER:
            raise ValueError(f"store: value at '{path}' exceeds the float64-safe integer range (±2^53)")
        return

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise ValueError(f"store: value at '{path}' is {value} — NaN/Infinity are not storable")
        return

    if isinstance(value, bytes | bytearray | memoryview):
        raise ValueError(
            f"store: value at '{path}' is binary — large artifacts belong in files under the plugin storage dir"
        )

    if isinstance(value, list | tuple):
        for index, entry in enumerate(value):
            _walk_value(entry, f"{path}[{index}]", depth + 1)
        return

    if isinstance(value, dict):
        for key, entry in value.items():
            if not isinstance(key, str):
                raise ValueError(f"store: map key {key!r} at '{path}' is not a string")
            _walk_value(entry, f"{path}.{key}", depth + 1)
        return

    raise ValueError(
        f"store: value at '{path}' is a {type(value).__name__} instance — only plain objects are storable"
    )


class PluginStoreFile:
    def __init__(self, volume_dir: str, plugin_id: str, log: StoreLogger | None = None) -> None:
        self._volume_dir = volume_dir
        self._plugin_id = plugin_id
        self._log = log
        self._path = str(Path(volume_dir) / STORE_FILE_NAME)
        self._writer = CoalescingWriter(self._write_snapshot, log)
        self._payload: dict[str, Any] = {}
        self._closed = True

    @property
    def path(self) -> str:
        return self._path

    async def open(self) -> None:
        await asyncio.to_thread(os.makedirs, self._volume_dir, exist_ok=True)
        await asyncio.to_thread(self._remove_orphaned_tmp_files)

        payload = await read_store_file(self._path, self._log)
        if payload is None:
            # Persist the initial envelope so later opens skip the legacy probe.
            payload = {}
            await write_store_file(self._path, payload, self._log)

        remapped = remap_legacy_layout(payload, self._plugin_id, self._log)
        if remapped is not payload:
            await write_store_file(self._path, remapped, self._log)

        self._payload = remapped
        await backup_store_file(self._path, self._log)
        self._closed = False

    def get(self) -> dict[str, Any]:
        return self._payload

    async def put(self, payload: dict[str, Any]) -> None:
        if self._closed:
            # A silently "successful" no-op here would lose the write during
            # shutdown windows. Fail loudly instead.
            raise RuntimeError(f"store: put on closed store {self._path}")
        self._payload = payload
        await self._writer.write(payload)

    async def close(self) -> None:
        self._closed = True
        await self._writer.idle()

    async def _write_snapshot(self, snapshot: dict[str, Any]) -> None:
        await write_store_file(self._path, snapshot, self._log)

    def _remove_orphaned_tmp_files(self) -> None:
        try:
            names = os.listdir(self._volume_dir)
        except OSError:
            return
        for name in names:
            if name.startswith(STORE_FILE_NAME) and ".tmp-" in name:
                with suppress(OSError):
                    os.unlink(os.path.join(self._volume_dir, name))
