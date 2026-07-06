interface SessionBody {
    doorbot_id: number;
    session_id: string;
}
interface AnswerMessage {
    method: 'sdp';
    body: {
        sdp: string;
        type: 'answer';
    } & SessionBody;
}
interface IceCandidateMessage {
    method: 'ice';
    body: {
        ice: string;
        mlineindex: number;
    } & SessionBody;
}
interface SessionCreatedMessage {
    method: 'session_created';
    body: SessionBody;
}
interface SessionStartedMessage {
    method: 'session_started';
    body: SessionBody;
}
interface PongMessage {
    method: 'pong';
    body: SessionBody;
}
interface NotificationMessage {
    method: 'notification';
    body: {
        is_ok: boolean;
        text: string;
    } & SessionBody;
}
interface CameraStartedMessage {
    method: 'camera_started';
    body: SessionBody;
}
interface StreamInfoMessage {
    method: 'stream_info';
    body: SessionBody & {
        transcoding: boolean;
        transcoding_reason: 'codec_mismatch' | string;
    };
}
declare const CloseReasonCode: {
    readonly NormalClose: 0;
    readonly AuthenticationFailed: 5;
    readonly Timeout: 6;
};
type CloseReasonCode = (typeof CloseReasonCode)[keyof typeof CloseReasonCode];
interface CloseMessage {
    method: 'close';
    body: {
        reason: {
            code: CloseReasonCode;
            text: string;
        };
    } & SessionBody;
}
export type IncomingMessage = AnswerMessage | IceCandidateMessage | SessionCreatedMessage | SessionStartedMessage | PongMessage | CloseMessage | NotificationMessage | CameraStartedMessage | StreamInfoMessage;
export {};
