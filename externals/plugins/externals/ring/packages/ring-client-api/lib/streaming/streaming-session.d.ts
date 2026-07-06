import { RtpPacket } from 'werift';
import { ReplaySubject, Subject } from 'rxjs';
import type { WebrtcConnection } from './webrtc-connection.ts';
import type { RingCamera } from '../ring-camera.ts';
import { Subscribed } from '../subscribed.ts';
type SpawnInput = string | number;
export interface FfmpegOptions {
    input?: SpawnInput[];
    video?: SpawnInput[] | false;
    audio?: SpawnInput[];
    stdoutCallback?: (data: Buffer) => void;
    output: SpawnInput[];
}
export declare class StreamingSession extends Subscribed {
    readonly onCallEnded: ReplaySubject<void>;
    private readonly onUsingOpus;
    readonly onVideoRtp: Subject<RtpPacket>;
    readonly onAudioRtp: Subject<RtpPacket>;
    private readonly audioSplitter;
    private readonly videoSplitter;
    private readonly returnAudioSplitter;
    private readonly camera;
    private connection;
    constructor(camera: RingCamera, connection: WebrtcConnection);
    private bindToConnection;
    /**
     * @deprecated
     * activate will be removed in the future. Please use requestKeyFrame if you want to explicitly request an initial key frame
     */
    activate(): void;
    cameraSpeakerActivated: boolean;
    activateCameraSpeaker(): void;
    reservePort(bufferPorts?: number): Promise<number>;
    get isUsingOpus(): Promise<boolean>;
    startTranscoding(ffmpegOptions: FfmpegOptions): Promise<void>;
    transcodeReturnAudio(ffmpegOptions: {
        input: SpawnInput[];
    }): Promise<void>;
    private hasEnded;
    private callEnded;
    stop(): void;
    sendAudioPacket(rtp: RtpPacket): void;
    requestKeyFrame(): void;
}
export {};
