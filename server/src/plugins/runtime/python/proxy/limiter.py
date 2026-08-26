from __future__ import annotations

import asyncio

REGISTER_CONCURRENCY = 8

_semaphore: asyncio.Semaphore | None = None


def registration_slot() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(REGISTER_CONCURRENCY)
    return _semaphore
