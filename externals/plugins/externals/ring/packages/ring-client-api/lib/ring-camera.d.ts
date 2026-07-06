import { RingCameraKind } from './ring-types.ts';
import { type CameraData, type CameraDeviceSettingsData, type CameraEventOptions, type CameraEventResponse, type CameraHealth, type HistoryOptions, type PeriodicFootageResponse, type PushNotificationDingV2, type VideoSearchResponse, type OnvifCameraData, type PushNotification } from './ring-types.ts';
import type { RingRestClient } from './rest-client.ts';
import { BehaviorSubject, Subject } from 'rxjs';
import { type DeepPartial } from './util.ts';
import { Subscribed } from './subscribed.ts';
import type { StreamingConnectionOptions } from './streaming/webrtc-connection.ts';
import type { FfmpegOptions } from './streaming/streaming-session.ts';
import { StreamingSession } from './streaming/streaming-session.ts';
import { SimpleWebRtcSession } from './streaming/simple-webrtc-session.ts';
export type AnyCameraData = CameraData | OnvifCameraData;
export declare function getBatteryLevel(data: Pick<CameraData, 'battery_life' | 'battery_life_2'> & {
    health?: Partial<CameraData['health']>;
}): number | null;
export declare function getSearchQueryString(options: CameraEventOptions | (HistoryOptions & {
    accountId: string;
})): string;
export declare function cleanSnapshotUuid(uuid?: string | null): string | null | undefined;
export declare class RingCamera extends Subscribed {
    id: number;
    deviceType: "onvif_camera" | Omit<RingCameraKind, "onvif_camera">;
    model: string;
    onData: BehaviorSubject<AnyCameraData>;
    hasLight: boolean;
    hasSiren: boolean;
    onRequestUpdate: Subject<unknown>;
    onNewNotification: Subject<PushNotificationDingV2>;
    onActiveNotifications: BehaviorSubject<PushNotificationDingV2[]>;
    onDoorbellPressed: import("rxjs").Observable<PushNotificationDingV2>;
    onMotionDetected: import("rxjs").Observable<boolean>;
    onMotionStarted: import("rxjs").Observable<null>;
    onBatteryLevel: import("rxjs").Observable<number | null>;
    onInHomeDoorbellStatus: import("rxjs").Observable<boolean>;
    private initialData;
    isDoorbot: boolean;
    private restClient;
    private avoidSnapshotBatteryDrain;
    constructor(initialData: AnyCameraData, isDoorbot: boolean, restClient: RingRestClient, avoidSnapshotBatteryDrain: boolean);
    updateData(update: AnyCameraData): void;
    requestUpdate(): void;
    get data(): AnyCameraData;
    get name(): string;
    get activeNotifications(): PushNotificationDingV2[];
    get latestNotification(): PushNotificationDingV2 | undefined;
    get latestNotificationSnapshotUuid(): string | undefined;
    get batteryLevel(): number | null;
    get hasBattery(): boolean;
    get hasLowBattery(): boolean;
    get isCharging(): boolean;
    get operatingOnBattery(): boolean;
    get canTakeSnapshotWhileRecording(): boolean;
    get isOffline(): boolean;
    get isRingEdgeEnabled(): boolean;
    get hasInHomeDoorbell(): boolean;
    doorbotUrl(path?: string): string;
    deviceUrl(path?: string): string;
    setLight(on: boolean): Promise<boolean>;
    setSiren(on: boolean): Promise<boolean>;
    setSettings(settings: DeepPartial<CameraData['settings']>): Promise<void>;
    setDeviceSettings(settings: DeepPartial<CameraDeviceSettingsData>): Promise<CameraDeviceSettingsData & import("./rest-client.ts").ExtendedResponse>;
    getDeviceSettings(): Promise<CameraDeviceSettingsData & import("./rest-client.ts").ExtendedResponse>;
    setInHomeDoorbell(enable: boolean): Promise<boolean>;
    getHealth(): Promise<CameraHealth>;
    private createStreamingConnection;
    startLiveCall(options?: StreamingConnectionOptions): Promise<StreamingSession>;
    private removeDingById;
    processPushNotification(notification: PushNotification): void;
    getEvents(options?: CameraEventOptions): Promise<CameraEventResponse & import("./rest-client.ts").ExtendedResponse>;
    videoSearch({ dateFrom, dateTo, order }?: {
        dateFrom: number;
        dateTo: number;
        order?: string | undefined;
    }): Promise<VideoSearchResponse & import("./rest-client.ts").ExtendedResponse>;
    getPeriodicalFootage({ startAtMs, endAtMs }?: {
        startAtMs: number;
        endAtMs: number;
    }): Promise<PeriodicFootageResponse & import("./rest-client.ts").ExtendedResponse>;
    getRecordingUrl(dingIdStr: string, { transcoded }?: {
        transcoded?: boolean | undefined;
    }): Promise<string>;
    private isTimestampInLifeTime;
    get snapshotsAreBlocked(): boolean;
    get snapshotLifeTime(): number;
    private lastSnapshotTimestamp;
    private lastSnapshotTimestampLocal;
    private lastSnapshotPromise?;
    get currentTimestampAge(): number;
    get hasSnapshotWithinLifetime(): boolean;
    private checkIfSnapshotsAreBlocked;
    private shouldUseExistingSnapshotPromise;
    private fetchingSnapshot;
    getSnapshot({ uuid }?: {
        uuid?: string;
    }): Promise<Buffer<ArrayBufferLike>>;
    getNextSnapshot({ afterMs, maxWaitMs, force, uuid, }: {
        afterMs?: number;
        maxWaitMs?: number;
        force?: boolean;
        uuid?: string;
    }): Promise<Buffer<ArrayBufferLike> & import("./rest-client.ts").ExtendedResponse>;
    getSnapshotByUuid(uuid: string): Promise<Buffer<ArrayBufferLike> & import("./rest-client.ts").ExtendedResponse>;
    recordToFile(outputPath: string, duration?: number): Promise<void>;
    streamVideo(ffmpegOptions: FfmpegOptions): Promise<StreamingSession>;
    /**
     * Returns a SimpleWebRtcSession, which can be initiated with an sdp offer.
     * This session has no backplane for trickle ICE, and is designed for use in a
     * browser setting.  Note, cameras with Ring Edge enabled will stream with the speaker
     * enabled as soon as the stream starts, which can drain the battery more quickly.
     */
    createSimpleWebRtcSession(): SimpleWebRtcSession;
    subscribeToDingEvents(): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    unsubscribeFromDingEvents(): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    subscribeToMotionEvents(): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    unsubscribeFromMotionEvents(): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    disconnect(): void;
}
