#### Source: Echo

Some sources may have a dynamic link. And you will need to get it using a bash or python script. Your script should echo a link to the source. RTSP, FFmpeg or any of the [supported sources](https://github.com/seydx/go2rtc#module-streams).

**Docker** and **Hass Add-on** users has preinstalled `python3`, `curl`, `jq`.
Check examples in [wiki](https://github.com/seydx/go2rtc/wiki/Source-Echo-examples).

```yaml
streams:
  apple_hls: echo:python3 hls.py https://developer.apple.com/streaming/examples/basic-stream-osx-ios5.html
```

_Source: [Go2Rtc Echo](https://github.com/seydx/go2rtc#source-echo)_
