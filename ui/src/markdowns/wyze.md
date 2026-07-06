#### Source: Wyze

This source allows you to stream from [Wyze](https://wyze.com/) cameras using native P2P protocol without the Wyze app or SDK.

**Important:**

1. **Requires Wyze account**. You need to login once via the WebUI to load your cameras.
2. **Requires firmware with DTLS**. Only cameras with DTLS-enabled firmware are supported.
3. Internet access is only needed when loading cameras from your account. After that, all streaming is local P2P.
4. Connection to the camera is local only (direct P2P to camera IP).

**Features:**

- H.264 and H.265 video codec support
- AAC, G.711, PCM, and Opus audio codec support
- Two-way audio (intercom) support
- Resolution switching (HD/SD)

## Setup

1. Get your API Key from [Wyze Developer Portal](https://support.wyze.com/hc/en-us/articles/16129834216731)
2. Go to go2rtc WebUI > Add > Wyze
3. Enter your API ID, API Key, email, and password
4. Select cameras to add - stream URLs are generated automatically

**Example Config**

```yaml
wyze:
  user@email.com:
    api_id: 'your-api-id'
    api_key: 'your-api-key'
    password: 'yourpassword' # or MD5 triple-hash with "md5:" prefix

streams:
  wyze_cam: wyze://192.168.1.123?uid=WYZEUID1234567890AB&enr=xxx&mac=AABBCCDDEEFF&model=HL_CAM4&dtls=true
```

## Stream URL Format

The stream URL is automatically generated when you add cameras via the WebUI:

```
wyze://[IP]?uid=[P2P_ID]&enr=[ENR]&mac=[MAC]&model=[MODEL]&subtype=[hd|sd]&dtls=true
```

| Parameter | Description                                     |
| --------- | ----------------------------------------------- |
| `IP`      | Camera's local IP address                       |
| `uid`     | P2P identifier (20 chars)                       |
| `enr`     | Encryption key for DTLS                         |
| `mac`     | Device MAC address                              |
| `model`   | Camera model (e.g., HL_CAM4)                    |
| `dtls`    | Enable DTLS encryption (default: true)          |
| `subtype` | Camera resolution: `hd` or `sd` (default: `hd`) |

## Configuration

### Resolution

You can change the camera's resolution using the `subtype` parameter:

```yaml
streams:
  wyze_hd: wyze://...&subtype=hd
  wyze_sd: wyze://...&subtype=sd
```

### Two-Way Audio

Two-way audio (intercom) is supported automatically. When a consumer sends audio to the stream, it will be transmitted to the camera's speaker.
