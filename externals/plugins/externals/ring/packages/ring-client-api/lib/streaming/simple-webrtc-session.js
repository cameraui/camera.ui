import { generateUuid } from "../util.js";
function liveViewUrl(path) {
    return `https://api.ring.com/integrations/v1/liveview/${path}`;
}
export class SimpleWebRtcSession {
    sessionId = generateUuid();
    camera;
    restClient;
    constructor(camera, restClient) {
        this.camera = camera;
        this.restClient = restClient;
    }
    async start(sdp) {
        // Check if live view is disabled by camera settings/modes
        if (this.camera.data.settings?.live_view_disabled === true) {
            throw new Error(`Live view is currently disabled for ${this.camera.name}. This camera has been disabled via mode settings in the Ring app. Enable live view for this camera in the Ring app to start streaming.`);
        }
        const response = await this.restClient.request({
            method: 'POST',
            url: liveViewUrl('start'),
            json: {
                session_id: this.sessionId,
                device_id: this.camera.id,
                sdp,
                protocol: 'webrtc',
            },
        });
        return response.sdp;
    }
    async end() {
        const resp = await this.restClient.request({
            method: 'POST',
            url: liveViewUrl('end'),
            json: {
                session_id: this.sessionId,
            },
        });
        return resp;
    }
    async activateCameraSpeaker() {
        await this.restClient.request({
            method: 'PATCH',
            url: liveViewUrl('options'),
            json: {
                session_id: this.sessionId,
                actions: ['turn_off_stealth_mode'],
            },
        });
    }
}
