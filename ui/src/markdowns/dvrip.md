#### Source: DVRIP

Other names: DVR-IP, NetSurveillance, Sofia protocol (NETsurveillance ActiveX plugin XMeye SDK).

- you can skip `username`, `password`, `port`, `channel` and `subtype` if they are default
- setup separate streams for different channels
- use `subtype=0` for Main stream, and `subtype=1` for Extra1 stream
- only the TCP protocol is supported

```yaml
streams:
  only_stream: dvrip://username:password@192.168.1.123:34567?channel=0&subtype=0
  only_tts: dvrip://username:password@192.168.1.123:34567?backchannel=1
  two_way_audio:
    - dvrip://username:password@192.168.1.123:34567?channel=0&subtype=0
    - dvrip://username:password@192.168.1.123:34567?backchannel=1
```

_Source: [Go2Rtc DVRIP](https://github.com/seydx/go2rtc#source-dvrip)_
