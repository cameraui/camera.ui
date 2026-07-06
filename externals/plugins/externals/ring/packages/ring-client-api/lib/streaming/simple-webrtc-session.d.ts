import type { RingCamera } from '../ring-camera.ts';
import type { RingRestClient } from '../rest-client.ts';
export declare class SimpleWebRtcSession {
    readonly sessionId: string;
    private readonly camera;
    private restClient;
    constructor(camera: RingCamera, restClient: RingRestClient);
    start(sdp: string): Promise<string>;
    end(): Promise<any>;
    activateCameraSpeaker(): Promise<void>;
}
