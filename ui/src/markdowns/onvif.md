#### Source: ONVIF

The source is not very useful if you already know RTSP and snapshot links for your camera. But it can be useful if you don't.

**WebUI > Add** webpage support ONVIF autodiscovery. Your server must be on the same subnet as the camera. If you use docker, you must use "network host".

```yaml
streams:
  dahua1: onvif://admin:password@192.168.1.123
  reolink1: onvif://admin:password@192.168.1.123:8000
  tapo1: onvif://admin:password@192.168.1.123:2020
```

_Source: [Go2Rtc Onvif](https://github.com/seydx/go2rtc#source-onvif)_
