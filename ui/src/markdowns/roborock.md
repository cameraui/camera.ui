#### Source: Roborock

This source type support Roborock vacuums with cameras. Known working models:

- Roborock S6 MaxV - only video (the vacuum has no microphone)
- Roborock S7 MaxV - video and two way audio
- Roborock Qrevo MaxV - video and two way audio

Source support load Roborock credentials from Home Assistant [custom integration](https://github.com/humbertogontijo/homeassistant-roborock) or the [core integration](https://www.home-assistant.io/integrations/roborock). Otherwise, you need to log in to your Roborock account (MiHome account is not supported). Go to: go2rtc WebUI > Add webpage. Copy `roborock://...` source for your vacuum and paste it to `go2rtc.yaml` config.

If you have graphic pin for your vacuum - add it as numeric pin (lines: 123, 456, 789) to the end of the roborock-link.

_Source: [Go2Rtc Roborock](https://github.com/seydx/go2rtc#source-roborock)_
