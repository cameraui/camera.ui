import type { RefreshTokenAuth, SessionOptions } from './rest-client.ts';
import { RingRestClient } from './rest-client.ts';
import { Location } from './location.ts';
import type { BaseStation, BeamBridge, CameraData, ChimeData, IntercomHandsetData, OnvifCameraData, ProfileResponse, ThirdPartyGarageDoorOpener, UnknownDevice, UserLocation } from './ring-types.ts';
import type { AnyCameraData } from './ring-camera.ts';
import { RingCamera } from './ring-camera.ts';
import { Subscribed } from './subscribed.ts';
export interface RingApiOptions extends SessionOptions {
    locationIds?: string[];
    cameraStatusPollingSeconds?: number;
    locationModePollingSeconds?: number;
    avoidSnapshotBatteryDrain?: boolean;
    debug?: boolean;
    ffmpegPath?: string;
    externalPorts?: {
        start: number;
        end: number;
    };
}
export declare class RingApi extends Subscribed {
    readonly restClient: RingRestClient;
    readonly onRefreshTokenUpdated: import("rxjs").Observable<{
        oldRefreshToken?: string;
        newRefreshToken: string;
    }>;
    readonly options: RingApiOptions & RefreshTokenAuth;
    constructor(options: RingApiOptions & RefreshTokenAuth);
    fetchRingDevices(): Promise<{
        doorbots: CameraData[];
        chimes: ChimeData[];
        authorizedDoorbots: CameraData[];
        stickupCams: CameraData[];
        allCameras: AnyCameraData[];
        baseStations: BaseStation[];
        beamBridges: BeamBridge[];
        onvifCameras: OnvifCameraData[];
        thirdPartyGarageDoorOpeners: ThirdPartyGarageDoorOpener[];
        intercoms: IntercomHandsetData[];
        unknownDevices: UnknownDevice[];
    }>;
    private listenForDeviceUpdates;
    private registerPushReceiver;
    fetchRawLocations(): Promise<UserLocation[]>;
    fetchAmazonKeyLocks(): Promise<any[] & import("./rest-client.ts").ExtendedResponse>;
    fetchAndBuildLocations(): Promise<Location[]>;
    private locationsPromise;
    getLocations(): Promise<Location[]>;
    getCameras(): Promise<RingCamera[]>;
    getProfile(): Promise<ProfileResponse & import("./rest-client.ts").ExtendedResponse>;
    disconnect(): void;
}
