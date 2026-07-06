#### Source: Tapo

[TP-Link Tapo](https://www.tapo.com/) proprietary camera protocol with **two way audio** support.

- stream quality is the same as [RTSP protocol](https://www.tapo.com/en/faq/34/)
- use the **cloud password**, this is not the RTSP password! you do not need to add a login!
- you can also use UPPERCASE MD5 hash from your cloud password with `admin` username
- some new camera firmwares requires SHA256 instead of MD5

```yaml
streams:
  # cloud password without username
  camera1: tapo://cloud-password@192.168.1.123
  # admin username and UPPERCASE MD5 cloud-password hash
  camera2: tapo://admin:UPPERCASE-MD5@192.168.1.123
  # admin username and UPPERCASE SHA256 cloud-password hash
  camera3: tapo://admin:UPPERCASE-SHA256@192.168.1.123
```

```bash
echo -n "cloud password" | md5 | awk '{print toupper($0)}'
echo -n "cloud password" | shasum -a 256 | awk '{print toupper($0)}'
```

_Source: [Go2Rtc Tapo](https://github.com/seydx/go2rtc#source-tapo)_
