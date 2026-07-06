#### Source: HomeKit

**Important:**

- You can use HomeKit Cameras **without Apple devices** (iPhone, iPad, etc.), it's just a yet another protocol
- HomeKit device can be paired with only one ecosystem. So, if you have paired it to an iPhone (Apple Home) - you can't pair it with Home Assistant or go2rtc. Or if you have paired it to go2rtc - you can't pair it with iPhone
- HomeKit device should be in same network with working [mDNS](https://en.wikipedia.org/wiki/Multicast_DNS) between device and go2rtc

go2rtc support import paired HomeKit devices from [Home Assistant](#source-hass). So you can use HomeKit camera with Hass and go2rtc simultaneously. If you using Hass, I recommend pairing devices with it, it will give you more options.

You can pair device with go2rtc on the HomeKit page. If you can't see your devices - reload the page. Also try reboot your HomeKit device (power off). If you still can't see it - you have a problems with mDNS.

If you see a device but it does not have a pair button - it is paired to some ecosystem (Apple Home, Home Assistant etc). You need to delete device from that ecosystem, and it will be available for pairing. If you cannot unpair device, you will have to reset it.

**Important:**

- HomeKit audio uses very non-standard **AAC-ELD** codec with very non-standard params and specification violation
- Audio can't be played in `VLC` and probably any other player
- Audio should be transcoded for using with MSE, WebRTC, etc.

Recommended settings for using HomeKit Camera with WebRTC, MSE, MP4, RTSP:

```
streams:
  aqara_g3:
    - hass:Camera-Hub-G3-AB12
    - ffmpeg:aqara_g3#audio=aac#audio=opus
```

RTSP link with "normal" audio for any player: `rtsp://192.168.1.123:8554/aqara_g3?video&audio=aac`

**This source is in active development!** Tested only with [Aqara Camera Hub G3](https://www.aqara.com/eu/product/camera-hub-g3) (both EU and CN versions).

_Source: [Go2Rtc HomeKit](https://github.com/seydx/go2rtc#source-homekit)_
