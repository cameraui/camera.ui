#### Source: ISAPI

This source type support only backchannel audio for Hikvision ISAPI protocol. So it should be used as second source in addition to the RTSP protocol.

```yaml
streams:
  hikvision1:
    - rtsp://admin:password@192.168.1.123:554/Streaming/Channels/101
    - isapi://admin:password@192.168.1.123:80/
```

_Source: [Go2Rtc Isapi](https://github.com/seydx/go2rtc#source-isapi)_
