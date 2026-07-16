from __future__ import annotations

from urllib.parse import urlparse

from _camera_ui_tools.camera_ui_sdk import RTSPUrlOptions, SnapshotUrlOptions


def build_target_url(rtsp_url: str, options: RTSPUrlOptions | None = None) -> str:
    if options is None:
        options = {}

    parsed = urlparse(rtsp_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

    video = options.get("video", True)
    audio = options.get("audio", True)
    audio_single_track = options.get("audioSingleTrack", True)
    backchannel = options.get("backchannel", False)
    timeout = options.get("timeout", 15)
    gop = options.get("gop", True)

    validated_timeout = min(max(5, timeout), 30)

    params: list[str] = []

    if video:
        params.append("video")

    if audio:
        if isinstance(audio, bool):
            params.append("audio")
        elif isinstance(audio, list):
            if audio_single_track:
                params.append(f"audio={','.join(audio)}")
            else:
                for codec in audio:
                    params.append(f"audio={codec}")
        else:
            params.append(f"audio={audio}")

    if backchannel:
        params.append("backchannel=opus,pcma,pcmu")

    if gop:
        params.append("gop=1")

    params.append(f"timeout={validated_timeout}")

    return f"{base_url}?{'&'.join(params)}"


def build_snapshot_url(
    camera_name: str, source_name: str, snapshot_url: str, options: SnapshotUrlOptions | None = None
) -> str:
    if options is None:
        options = {}

    parsed = urlparse(snapshot_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

    width = options.get("width")
    height = options.get("height")
    rotate = options.get("rotate")
    cache = options.get("cache")
    hw = options.get("hw")
    gop = options.get("gop", True)

    params: list[str] = []

    source = create_source_name(camera_name, source_name)
    params.append(f"src={source}")

    if width and width > 0:
        params.append(f"w={width}")

    if height and height > 0:
        params.append(f"h={height}")

    if rotate:
        params.append(f"rotate={rotate}")

    if cache:
        params.append(f"cache={cache}")

    if hw:
        params.append(f"hw={hw}")

    if gop:
        params.append("gop=1")
    else:
        params.append("gop=0")

    return f"{base_url}?{'&'.join(params)}"


def create_source_name(camera_name: str, source_name: str) -> str:
    return f"cui_{camera_name.replace(' ', '_').lower()}_{source_name.replace(' ', '_').lower()}"
