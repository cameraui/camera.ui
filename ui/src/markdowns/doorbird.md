#### Source: Doorbird

[Doorbird](https://www.doorbird.com/) proprietary camera protocol with **two way audio** support.

```yaml
streams:
  video-audio:
    - rtsp://user:pass@123.123.123.123:554/mpeg/media.amp
    - doorbird://user:pass@123.123.123.123?media=audio
  two-way:
    - rtsp://user:pass@123.123.123.123:554/mpeg/media.amp
    - doorbird://user:pass@123.123.123.123?media=audio
    - doorbird://user:pass@123.123.123.123
  mjpeg-video:
    - doorbird://user:pass@123.123.123.123?media=video
```

_Source: [Go2Rtc Tuya](https://github.com/seydx/go2rtc#source-doorbird)_
