from __future__ import annotations

from typing import Any


def deep_equal(a: Any, b: Any, ignore_order: bool = False) -> bool:
    # 1 and 1.0 or True and 1 count as a change, like a stored setting switching type
    if type(a) is not type(b):
        return False

    if isinstance(a, dict):
        return a.keys() == b.keys() and all(deep_equal(a[key], b[key], ignore_order) for key in a)

    if isinstance(a, (list, tuple)):
        if len(a) != len(b):
            return False
        if not ignore_order:
            return all(deep_equal(x, y) for x, y in zip(a, b, strict=True))

        rest = list(b)
        for item in a:
            match = next((index for index, other in enumerate(rest) if deep_equal(item, other, True)), None)
            if match is None:
                return False
            del rest[match]
        return True

    return bool(a == b)
