#### Source: WebRTC

This source type support four connection formats.

**whep**

[WebRTC/WHEP](https://datatracker.ietf.org/doc/draft-murillo-whep/) - is replaced by [WebRTC/WISH](https://datatracker.ietf.org/doc/charter-ietf-wish/02/) standard for WebRTC video/audio viewers. But it may already be supported in some third-party software. It is supported in go2rtc.

**go2rtc**

This format is only supported in go2rtc. Unlike WHEP it supports asynchronous WebRTC connection and two way audio.

**openipc**

Support connection to [OpenIPC](https://openipc.org/) cameras.

**wyze**

Supports connection to [Wyze](https://www.wyze.com/) cameras, using WebRTC protocol. You can use [docker-wyze-bridge](https://github.com/mrlt8/docker-wyze-bridge) project to get connection credentials.

**kinesis**

Supports [Amazon Kinesis Video Streams](https://aws.amazon.com/kinesis/video-streams/), using WebRTC protocol. You need to specify signalling WebSocket URL with all credentials in query params, `client_id` and `ice_servers` list in [JSON format](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer).

```yaml
streams:
  webrtc-whep: webrtc:http://192.168.1.123:1984/api/webrtc?src=camera1
  webrtc-go2rtc: webrtc:ws://192.168.1.123:1984/api/ws?src=camera1
  webrtc-openipc: webrtc:ws://192.168.1.123/webrtc_ws#format=openipc#ice_servers=[{"urls":"stun:stun.kinesisvideo.eu-north-1.amazonaws.com:443"}]
  webrtc-wyze: webrtc:http://192.168.1.123:5000/signaling/camera1?kvs#format=wyze
  webrtc-kinesis: webrtc:wss://...amazonaws.com/?...#format=kinesis#client_id=...#ice_servers=[{...},{...}]
```

**PS.** For `kinesis` sources you can use [echo](#source-echo) to get connection params using `bash`/`python` or any other script language.

_Source: [Go2Rtc WebRTC](https://github.com/seydx/go2rtc#source-webrtc)_
