import type { ChimeData, ChimeUpdate, ChimeSoundKind, RingtoneOptions, ChimeHealth } from './ring-types.ts';
import type { RingRestClient } from './rest-client.ts';
import { BehaviorSubject, Subject } from 'rxjs';
export declare class RingChime {
    id: number;
    deviceType: import("./ring-types.ts").ChimeKind;
    model: string;
    onData: BehaviorSubject<ChimeData>;
    onRequestUpdate: Subject<unknown>;
    private initialData;
    private restClient;
    constructor(initialData: ChimeData, restClient: RingRestClient);
    updateData(update: ChimeData): void;
    requestUpdate(): void;
    get data(): ChimeData;
    get name(): string;
    get description(): string;
    get volume(): number;
    getRingtones(): Promise<RingtoneOptions & import("./rest-client.ts").ExtendedResponse>;
    getRingtoneByDescription(description: string, kind: ChimeSoundKind): Promise<{
        user_id: string;
        id: string;
        description: string;
        kind: string;
        url: string;
        checksum: string;
        available: string;
    }>;
    chimeUrl(path?: string): string;
    playSound(kind: ChimeSoundKind): Promise<void & import("./rest-client.ts").ExtendedResponse>;
    snooze(time: number): Promise<void>;
    clearSnooze(): Promise<void>;
    updateChime(update: ChimeUpdate): Promise<boolean>;
    setVolume(volume: number): Promise<boolean>;
    getHealth(): Promise<ChimeHealth>;
    setNightlightEnabled(enabled: boolean): Promise<void>;
}
