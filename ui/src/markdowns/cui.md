#### Source: CUI

This source can be used to stream dynamically generated, go2rtc compatible, URLs. The source is just a placeholder for a `https://` URL.

```yaml
streams:
  camera1: cui://192.168.1.123:34567/some-identifier-if-you-want
```

The URL will be changed to `https://192.168.1.123:34567/some-identifier-if-you-want` and the response must be like this:

```json
{
  {
    "streamUrl": "rtsp://192.168.1.1:554/stream",
  }
}
```

Go2rtc will then use the `streamUrl` to stream the video. The `streamUrl` can be any URL that is compatible with go2rtc. The response must be a valid JSON object with the `streamUrl` key.
