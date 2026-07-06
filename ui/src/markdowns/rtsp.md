#### Source: RTSP

```yaml
streams:
  sonoff_camera: rtsp://rtsp:12345678@192.168.1.123/av_stream/ch0
  dahua_camera:
    - rtsp://admin:password@192.168.1.123/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif
    - rtsp://admin:password@192.168.1.123/cam/realmonitor?channel=1&subtype=1
  amcrest_doorbell:
    - rtsp://username:password@192.168.1.123:554/cam/realmonitor?channel=1&subtype=0#backchannel=0
  unifi_camera: rtspx://192.168.1.123:7441/fD6ouM72bWoFijxK
  glichy_camera: ffmpeg:rtsp://username:password@192.168.1.123/live/ch00_1
```

**Recommendations**

- **Amcrest Doorbell** users may want to disable two way audio, because with an active stream you won't have a call button working. You need to add `#backchannel=0` to the end of your RTSP link in YAML config file
- **Dahua Doorbell** users may want to change backchannel [audio codec](https://github.com/AlexxIT/go2rtc/issues/52)
- **Reolink** users may want NOT to use RTSP protocol at all, some camera models have a very awful unusable stream implementation
- **Ubiquiti UniFi** users may want to disable HTTPS verification. Use `rtspx://` prefix instead of `rtsps://`. And don't use `?enableSrtp` [suffix](https://github.com/AlexxIT/go2rtc/issues/81)
- **TP-Link Tapo** users may skip login and password, because go2rtc support login [without them](https://drmnsamoliu.github.io/video.html)
- If your camera has two RTSP links - you can add both of them as sources. This is useful when streams has different codecs, as example AAC audio with main stream and PCMU/PCMA audio with second stream
- If the stream from your camera is glitchy, try using [ffmpeg source](#source-ffmpeg). It will not add CPU load if you won't use transcoding
- If the stream from your camera is very glitchy, try to use transcoding with [ffmpeg source](#source-ffmpeg)

**Other options**

Format: `rtsp...#{param1}#{param2}#{param3}`

- Add custom timeout `#timeout=30` (in seconds)
- Ignore audio - `#media=video` or ignore video - `#media=audio`
- Ignore two way audio API `#backchannel=0` - important for some glitchy cameras
- Use WebSocket transport `#transport=ws...`

**RTSP over WebSocket**

```yaml
streams:
  # WebSocket with authorization, RTSP - without
  axis-rtsp-ws: rtsp://192.168.1.123:4567/axis-media/media.amp?overview=0&camera=1&resolution=1280x720&videoframeskipmode=empty&Axis-Orig-Sw=true#transport=ws://user:pass@192.168.1.123:4567/rtsp-over-websocket
  # WebSocket without authorization, RTSP - with
  dahua-rtsp-ws: rtsp://user:pass@192.168.1.123/cam/realmonitor?channel=1&subtype=1&proto=Private3#transport=ws://192.168.1.123/rtspoverwebsocket
```

_Source: [Go2Rtc RTSP](https://github.com/seydx/go2rtc#source-rtsp)_
