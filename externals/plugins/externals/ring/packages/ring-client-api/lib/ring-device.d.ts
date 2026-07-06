import { BehaviorSubject } from 'rxjs';
import type { RingDeviceData } from './ring-types.ts';
import type { Location } from './location.ts';
import { Subscribed } from './subscribed.ts';
export declare class RingDevice extends Subscribed {
    onData: BehaviorSubject<RingDeviceData>;
    zid: string;
    id: string;
    deviceType: import("./ring-types.ts").RingDeviceType;
    categoryId: number;
    onComponentDevices: import("rxjs").Observable<RingDevice[]>;
    private initialData;
    location: Location;
    assetId: string;
    constructor(initialData: RingDeviceData, location: Location, assetId: string);
    updateData(update: Partial<RingDeviceData>): void;
    get data(): RingDeviceData;
    get name(): string;
    get supportsVolume(): boolean;
    setVolume(volume: number): Promise<void>;
    setInfo(body: any): Promise<void>;
    sendCommand(commandType: string, data?: {}): void;
    toString(): string;
    toJSON(): string;
    disconnect(): void;
}
