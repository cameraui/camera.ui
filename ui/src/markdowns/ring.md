#### Source: Ring

This source type support Ring cameras with [two way audio](#two-way-audio) support. If you have a `refresh_token` and `device_id` - you can use it in `go2rtc.yaml` config file. Otherwise, you can use the go2rtc interface and add your ring account (WebUI > Add > Ring). Once added, it will list all your Ring cameras.

```yaml
streams:
  ring: ring:?device_id=XXX&refresh_token=XXX
  ring_snapshot: ring:?device_id=XXX&refresh_token=XXX&snapshot
```

_Source: [Go2Rtc Ring](https://github.com/seydx/go2rtc#source-ring)_
