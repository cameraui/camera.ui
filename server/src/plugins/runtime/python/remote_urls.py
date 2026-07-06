import os
import re
from typing import Any

_LOCALHOST = re.compile(r"127\.0\.0\.1|localhost")


def _rewrite_url(url: str, master: str, user: str | None, password: str | None) -> str:
    rewritten = _LOCALHOST.sub(master, url)

    if (
        user
        and rewritten.startswith("rtsp://")
        and "@" not in rewritten[7:].split("/")[0]
    ):
        rewritten = rewritten.replace("rtsp://", f"rtsp://{user}:{password or ''}@", 1)

    return rewritten


def _walk(value: Any, master: str, user: str | None, password: str | None) -> Any:
    if isinstance(value, str):
        return _rewrite_url(value, master, user, password)
    if isinstance(value, list):
        return [_walk(v, master, user, password) for v in value]
    if isinstance(value, dict):
        return {k: _walk(v, master, user, password) for k, v in value.items()}
    return value


def rewrite_source_urls_for_remote(urls: Any) -> Any:
    """No-op unless running remote-hosted with a known master address."""
    master = os.environ.get("CAMERAUI_MASTER_ADDRESS")
    if not os.environ.get("PLUGIN_REMOTE_MODE") or not master:
        return urls

    return _walk(
        urls,
        master,
        os.environ.get("CAMERAUI_RTSP_USERNAME"),
        os.environ.get("CAMERAUI_RTSP_PASSWORD"),
    )
