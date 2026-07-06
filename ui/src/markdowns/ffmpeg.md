#### Source: FFmpeg

You can get any stream or file or device via FFmpeg and push it to go2rtc. The app will automatically start FFmpeg with the proper arguments when someone starts watching the stream.

- FFmpeg preistalled for **Docker** and **Hass Add-on** users
- **Hass Add-on** users can target files from [/media](https://www.home-assistant.io/more-info/local-media/setup-media/) folder

Format: `ffmpeg:{input}#{param1}#{param2}#{param3}`. Examples:

```yaml
streams:
  # [FILE] all tracks will be copied without transcoding codecs
  file1: ffmpeg:/media/BigBuckBunny.mp4

  # [FILE] video will be transcoded to H264, audio will be skipped
  file2: ffmpeg:/media/BigBuckBunny.mp4#video=h264

  # [FILE] video will be copied, audio will be transcoded to pcmu
  file3: ffmpeg:/media/BigBuckBunny.mp4#video=copy#audio=pcmu

  # [HLS] video will be copied, audio will be skipped
  hls: ffmpeg:https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/gear5/prog_index.m3u8#video=copy

  # [MJPEG] video will be transcoded to H264
  mjpeg: ffmpeg:http://185.97.122.128/cgi-bin/faststream.jpg#video=h264

  # [RTSP] video with rotation, should be transcoded, so select H264
  rotate: ffmpeg:rtsp://rtsp:12345678@192.168.1.123/av_stream/ch0#video=h264#rotate=90
```

All trascoding formats has [built-in templates](https://github.com/seydx/go2rtc/blob/master/internal/ffmpeg/ffmpeg.go): `h264`, `h265`, `opus`, `pcmu`, `pcmu/16000`, `pcmu/48000`, `pcma`, `pcma/16000`, `pcma/48000`, `aac`, `aac/16000`.

But you can override them via YAML config. You can also add your own formats to config and use them with source params.

```yaml
ffmpeg:
  bin: ffmpeg # path to ffmpeg binary
  h264: '-codec:v libx264 -g:v 30 -preset:v superfast -tune:v zerolatency -profile:v main -level:v 4.1'
  mycodec: '-any args that supported by ffmpeg...'
  myinput: '-fflags nobuffer -flags low_delay -timeout 5000000 -i {input}'
  myraw: '-ss 00:00:20'
```

- You can use go2rtc stream name as ffmpeg input (ex. `ffmpeg:camera1#video=h264`)
- You can use `video` and `audio` params multiple times (ex. `#video=copy#audio=copy#audio=pcmu`)
- You can use `rotate` param with `90`, `180`, `270` or `-90` values, important with transcoding (ex. `#video=h264#rotate=90`)
- You can use `width` and/or `height` params, important with transcoding (ex. `#video=h264#width=1280`)
- You can use `drawtext` to add a timestamp (ex. `drawtext=x=2:y=2:fontsize=12:fontcolor=white:box=1:boxcolor=black`)
  - This will greatly increase the CPU of the server, even with hardware acceleration
- You can use `raw` param for any additional FFmpeg arguments (ex. `#raw=-vf transpose=1`)
- You can use `input` param to override default input template (ex. `#input=rtsp/udp` will change RTSP transport from TCP to UDP+TCP)
  - You can use raw input value (ex. `#input=-timeout 5000000 -i {input}`)
  - You can add your own input templates

Read more about [hardware acceleration](https://github.com/seydx/go2rtc/wiki/Hardware-acceleration).

**PS.** It is recommended to check the available hardware in the WebUI add page.

<hr>

#### Source: FFmpeg Device

You can get video from any USB-camera or Webcam as RTSP or WebRTC stream. This is part of FFmpeg integration.

- check available devices in Web interface
- `video_size` and `framerate` must be supported by your camera!
- for Linux supported only video for now
- for macOS you can stream Facetime camera or whole Desktop!
- for macOS important to set right framerate

Format: `ffmpeg:device?{input-params}#{param1}#{param2}#{param3}`

```yaml
streams:
  linux_usbcam: ffmpeg:device?video=0&video_size=1280x720#video=h264
  windows_webcam: ffmpeg:device?video=0#video=h264
  macos_facetime: ffmpeg:device?video=0&audio=1&video_size=1280x720&framerate=30#video=h264#audio=pcma
```

**PS.** It is recommended to check the available devices in the WebUI add page.

_Source: [Go2Rtc FFmpeg](https://github.com/seydx/go2rtc#source-ffmpeg) & [Go2Rtc FFmpeg Device](https://github.com/seydx/go2rtc#source-ffmpeg-device)_
