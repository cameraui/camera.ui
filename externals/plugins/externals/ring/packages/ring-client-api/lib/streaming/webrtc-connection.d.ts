import { ReplaySubject, Subject } from 'rxjs';
import type { RingCamera } from '../ring-camera.ts';
import { type BasicPeerConnection } from './peer-connection.ts';
import { Subscribed } from '../subscribed.ts';
import type { RtpPacket } from 'werift';
export interface StreamingConnectionOptions {
    createPeerConnection?: () => BasicPeerConnection;
}
export declare class WebrtcConnection extends Subscribed {
    private readonly onSessionId;
    private readonly onOfferSent;
    private readonly dialogId;
    readonly onCameraConnected: ReplaySubject<void>;
    readonly onCallAnswered: ReplaySubject<string>;
    readonly onCallEnded: ReplaySubject<void>;
    readonly onError: ReplaySubject<void>;
    readonly onMessage: ReplaySubject<{
        method: string;
    }>;
    readonly onWsOpen: import("rxjs").Observable<Event>;
    readonly onAudioRtp: Subject<RtpPacket>;
    readonly onVideoRtp: Subject<RtpPacket>;
    private readonly pc;
    private readonly ws;
    private camera;
    constructor(ticket: string, camera: RingCamera, options: StreamingConnectionOptions);
    private initiateCall;
    private sessionId;
    private handleMessage;
    private sendSessionMessage;
    private sendMessage;
    sendAudioPacket(rtp: RtpPacket): void;
    private activate;
    activateCameraSpeaker(): void;
    private hasEnded;
    private callEnded;
    stop(): void;
    requestKeyFrame(): void;
}
