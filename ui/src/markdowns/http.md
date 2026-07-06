#### Source: HTTP

Support Content-Type:

- **HTTP-FLV** (`video/x-flv`) - same as RTMP, but over HTTP
- **HTTP-JPEG** (`image/jpeg`) - camera snapshot link, can be converted by go2rtc to MJPEG stream
- **HTTP-MJPEG** (`multipart/x`) - simple MJPEG stream over HTTP
- **MPEG-TS** (`video/mpeg`) - legacy [streaming format](https://en.wikipedia.org/wiki/MPEG_transport_stream)

Source also support HTTP and TCP streams with autodetection for different formats: **MJPEG**, **H.264/H.265 bitstream**, **MPEG-TS**.

```yaml
streams:
  # [HTTP-FLV] stream in video/x-flv format
  http_flv: http://192.168.1.123:20880/api/camera/stream/780900131155/657617

  # [JPEG] snapshots from Dahua camera, will be converted to MJPEG stream
  dahua_snap: http://admin:password@192.168.1.123/cgi-bin/snapshot.cgi?channel=1

  # [MJPEG] stream will be proxied without modification
  http_mjpeg: https://mjpeg.sanford.io/count.mjpeg

  # [MJPEG or H.264/H.265 bitstream or MPEG-TS]
  tcp_magic: tcp://192.168.1.123:12345

  # Add custom header
  custom_header: 'https://mjpeg.sanford.io/count.mjpeg#header=Authorization: Bearer XXX'
```

**PS.** Dahua camera has bug: if you select MJPEG codec for RTSP second stream - snapshot won't work.

_Source: [Go2Rtc Http](https://github.com/seydx/go2rtc#source-http)_
