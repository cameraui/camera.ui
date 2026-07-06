#### Source: Nest

Currently only WebRTC cameras are supported.

For simplicity, it is recommended to connect the Nest/WebRTC camera to the [Home Assistant](#source-hass). But if you can somehow get the below parameters - Nest/WebRTC source will work without Hass.

```yaml
streams:
  nest-doorbell: nest:?client_id=***&client_secret=***&refresh_token=***&project_id=***&device_id=***
```

_Source: [Go2Rtc Nest](https://github.com/seydx/go2rtc#source-nest)_
