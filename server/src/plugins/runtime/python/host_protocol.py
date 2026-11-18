from __future__ import annotations

import asyncio
import contextlib
import json
import os
import signal
import sys
import threading
import time
from typing import cast

from _camera_ui_tools.camera_ui_common import SignalHandler

HOST_PROTOCOL = 2
HOST_PROTOCOL_ENV = "CAMERAUI_HOST_PROTOCOL"
STOP_BUDGET_ENV = "CAMERAUI_STOP_BUDGET_MS"
INSTANCE_ID_ENV = "CAMERAUI_INSTANCE_ID"
STDIN_POLL_INTERVAL = 0.2


def host_speaks_stop_line() -> bool:
    try:
        return int(os.environ.get(HOST_PROTOCOL_ENV, "0")) >= HOST_PROTOCOL
    except ValueError:
        return False


def host_stop_budget(fallback: float) -> float:
    try:
        budget_ms = float(os.environ.get(STOP_BUDGET_ENV, "0"))
    except ValueError:
        budget_ms = 0
    return budget_ms / 1000 if host_speaks_stop_line() and budget_ms > 0 else fallback


def parse_stop_line(line: str) -> float | None:
    try:
        budget_ms = json.loads(line)["stop"]["budgetMs"]
    except (ValueError, KeyError, TypeError):
        return None
    if isinstance(budget_ms, bool) or not isinstance(budget_ms, int | float) or budget_ms <= 0:
        return None
    return budget_ms / 1000


def listen_for_host_stop(signal_handler: SignalHandler) -> None:
    if not host_speaks_stop_line():
        return

    loop = asyncio.get_running_loop()
    tasks: set[asyncio.Task[None]] = set()

    with contextlib.suppress(NotImplementedError):
        loop.add_signal_handler(signal.SIGINT, lambda: None)

    def stop(reason: str, budget: float | None = None) -> None:
        if budget is not None:
            signal_handler.timeout_duration = budget
        task = loop.create_task(signal_handler.gracefully_close(reason))
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    try:
        fd = sys.stdin.fileno()
    except (AttributeError, OSError, ValueError):
        return

    def read() -> None:
        pending = b""
        while True:
            chunk = _read_stdin(fd)
            if not chunk:
                break
            *lines, pending = (pending + chunk).split(b"\n")
            for line in lines:
                budget = parse_stop_line(line.decode(errors="replace"))
                if budget is not None:
                    loop.call_soon_threadsafe(stop, "stop request from the host", budget)
                    return
        loop.call_soon_threadsafe(stop, "host closed stdin")

    # loop stdin readers differ between asyncio, uvloop and windows
    threading.Thread(target=read, name="host-stop", daemon=True).start()


def reset_signals_in_forks() -> None:
    if hasattr(os, "register_at_fork"):
        os.register_at_fork(after_in_child=_reset_signals)


if sys.platform == "win32":
    import _winapi
    import msvcrt

    def _read_stdin(fd: int) -> bytes:
        try:
            handle = msvcrt.get_osfhandle(fd)
            # a read blocked on the synchronous pipe also blocks every peek at it, a dll's c runtime peeks stdin while it loads
            while True:
                available, _ = cast("tuple[int, int]", _winapi.PeekNamedPipe(handle))
                if available:
                    return os.read(fd, min(available, 4096))
                time.sleep(STDIN_POLL_INTERVAL)
        except OSError:
            return b""

else:

    def _read_stdin(fd: int) -> bytes:
        try:
            # raw reads, a thread blocked in sys.stdin holds its lock and hangs forks that close it
            return os.read(fd, 4096)
        except OSError:
            return b""


def _reset_signals() -> None:
    with contextlib.suppress(ValueError, OSError):
        signal.set_wakeup_fd(-1)
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(ValueError, OSError):
            signal.signal(sig, signal.SIG_DFL)
