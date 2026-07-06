#### Source: Bubble

Other names: [ESeeCloud](http://www.eseecloud.com/), [dvr163](http://help.dvr163.com/).

- you can skip `username`, `password`, `port`, `ch` and `stream` if they are default
- setup separate streams for different channels and streams

```yaml
streams:
  camera1: bubble://username:password@192.168.1.123:34567/bubble/live?ch=0&stream=0
```

_Source: [Go2Rtc Bubble](https://github.com/seydx/go2rtc#source-bubble)_
