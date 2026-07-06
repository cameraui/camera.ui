import type { IntercomHandsetData, PushNotification } from './ring-types.ts';
import type { RingRestClient } from './rest-client.ts';
import { BehaviorSubject, Subject } from 'rxjs';
export declare class RingIntercom {
    id: number;
    deviceType: "intercom_handset_audio" | "intercom_handset_video";
    onData: BehaviorSubject<IntercomHandsetData>;
    onRequestUpdate: Subject<unknown>;
    onBatteryLevel: import("rxjs").Observable<number | null>;
    onDing: Subject<void>;
    onUnlocked: Subject<void>;
    private initialData;
    private restClient;
    constructor(initialData: IntercomHandsetData, restClient: RingRestClient);
    updateData(update: IntercomHandsetData): void;
    requestUpdate(): void;
    get data(): IntercomHandsetData;
    get name(): string;
    get isOffline(): boolean;
    get batteryLevel(): number | null;
    unlock(): Promise<import("./rest-client.ts").ExtendedResponse>;
    private doorbotUrl;
    subscribeToDingEvents(): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    unsubscribeFromDingEvents(): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    processPushNotification(notification: PushNotification): void;
}
