#### Source: Hass

Support import camera links from [Home Assistant](https://www.home-assistant.io/) config files:

- [Generic Camera](https://www.home-assistant.io/integrations/generic/), setup via GUI
- [HomeKit Camera](https://www.home-assistant.io/integrations/homekit_controller/)
- [ONVIF](https://www.home-assistant.io/integrations/onvif/)
- [Roborock](https://github.com/humbertogontijo/homeassistant-roborock) vacuums with camera

```yaml
hass:
  config: '/config' # skip this setting if you Hass Add-on user

streams:
  generic_camera: hass:Camera1 # Settings > Integrations > Integration Name
  aqara_g3: hass:Camera-Hub-G3-AB12
```

**WebRTC Cameras**

Any cameras in WebRTC format are supported. But at the moment Home Assistant only supports some [Nest](https://www.home-assistant.io/integrations/nest/) cameras in this fomat.

The Nest API only allows you to get a link to a stream for 5 minutes. So every 5 minutes the stream will be reconnected.

```yaml
streams:
  # link to Home Assistant Supervised
  hass-webrtc1: hass://supervisor?entity_id=camera.nest_doorbell
  # link to external Hass with Long-Lived Access Tokens
  hass-webrtc2: hass://192.168.1.123:8123?entity_id=camera.nest_doorbell&token=eyXYZ...
```

_Source: [Go2Rtc Hass](https://github.com/seydx/go2rtc#source-hass)_
