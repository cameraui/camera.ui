import { isEqual, structuredClone, Subscribed } from '@camera.ui/common/utils';
import { BehaviorSubject, distinctUntilChanged, filter, mergeMap, pairwise, ReplaySubject, share } from '@camera.ui/sdk';

import { normalizeZones } from './zones.js';

import type {
  Camera,
  CameraDetectionSettings,
  CameraDevice as CameraDeviceInterface,
  CameraDeviceSource,
  CameraExportSettings,
  CameraFrameWorkerSettings,
  CameraImplementation,
  CameraInformation,
  CameraNotificationSettings,
  CameraPluginInfo,
  CameraRecordingSettings,
  CameraType,
  CameraUiSettings,
  CameraZones,
  DetectionEvent,
  DetectionEventType,
  DeviceStorage,
  JsonSchema,
  LoggerService,
  Observable,
  PluginAssignments,
  PtzAutotrackSettings,
  Sensor,
  SnapshotSettings,
} from '@camera.ui/sdk';

export abstract class CameraDevice extends Subscribed implements CameraDeviceInterface {
  public readonly cameraSubject: BehaviorSubject<Camera>;
  public readonly cameraState = new BehaviorSubject<boolean>(false);
  public readonly frameWorkerState = new BehaviorSubject<boolean>(false);

  public readonly onConnected = this.#createStateObservable(this.cameraState);
  public readonly onFrameWorkerConnected = this.#createStateObservable(this.frameWorkerState);

  public abstract readonly onDetectionEvent: Observable<{ type: DetectionEventType; event: DetectionEvent }>;

  protected readonly initialized = new BehaviorSubject<boolean>(false);
  protected readonly onInitialized = this.initialized.pipe(distinctUntilChanged(), share({ connector: () => new ReplaySubject(1) }));

  constructor(
    camera: Camera,
    public readonly logger: LoggerService,
  ) {
    super();

    this.cameraSubject = new BehaviorSubject(camera);
  }

  public abstract get sources(): CameraDeviceSource[];

  public get id(): string {
    return this.cameraSubject.getValue()._id;
  }

  public get nativeId(): string | undefined {
    return this.cameraSubject.getValue().nativeId;
  }

  public get pluginInfo(): CameraPluginInfo | undefined {
    const info = this.cameraSubject.getValue().pluginInfo;
    return info ? structuredClone(info) : undefined;
  }

  public get connected(): boolean {
    return this.cameraState.getValue();
  }

  public get frameWorkerConnected(): boolean {
    return this.frameWorkerState.getValue();
  }

  public get disabled(): boolean {
    return this.cameraSubject.getValue().disabled;
  }

  get snooze(): boolean {
    return this.cameraSubject.getValue().detectionSettings?.snooze ?? false;
  }

  public get name(): string {
    return this.cameraSubject.getValue().name;
  }

  public get room(): string {
    return this.cameraSubject.getValue().room;
  }

  public get type(): CameraType {
    return this.cameraSubject.getValue().type;
  }

  public get info(): CameraInformation {
    return structuredClone(this.cameraSubject.getValue().info);
  }

  public get isCloud(): boolean {
    return this.cameraSubject.getValue().isCloud;
  }

  public get assignments(): PluginAssignments {
    return structuredClone(this.cameraSubject.getValue().assignments);
  }

  public get snapshotSettings(): SnapshotSettings {
    return structuredClone(this.cameraSubject.getValue().snapshotSettings);
  }

  public get zones(): CameraZones {
    return normalizeZones(structuredClone(this.cameraSubject.getValue().zones));
  }

  public get detectionSettings(): CameraDetectionSettings {
    return structuredClone(this.cameraSubject.getValue().detectionSettings);
  }

  public get ptzAutotrack(): PtzAutotrackSettings {
    return structuredClone(this.cameraSubject.getValue().ptzAutotrack);
  }

  public get recordingSettings(): CameraRecordingSettings {
    return structuredClone(this.cameraSubject.getValue().recordingSettings);
  }

  public get notificationSettings(): CameraNotificationSettings {
    return structuredClone(this.cameraSubject.getValue().notificationSettings);
  }

  public get exportSettings(): CameraExportSettings {
    return structuredClone(this.cameraSubject.getValue().exportSettings);
  }

  public get frameWorkerSettings(): CameraFrameWorkerSettings {
    return structuredClone(this.cameraSubject.getValue().frameWorkerSettings);
  }

  public get interfaceSettings(): CameraUiSettings {
    return structuredClone(this.cameraSubject.getValue().interfaceSettings);
  }

  public get streamSource(): CameraDeviceSource {
    return (this.highResolutionSource ?? this.midResolutionSource ?? this.lowResolutionSource)!;
  }

  public get highResolutionSource(): CameraDeviceSource | undefined {
    return this.sources.find((source) => source.role === 'high-resolution');
  }

  public get midResolutionSource(): CameraDeviceSource | undefined {
    return this.sources.find((source) => source.role === 'mid-resolution');
  }

  public get lowResolutionSource(): CameraDeviceSource | undefined {
    return this.sources.find((source) => source.role === 'low-resolution');
  }

  public get designatedSnapshotSource(): CameraDeviceSource | undefined {
    const sources = this.sources;
    return sources.find((source) => source.role === 'snapshot') ?? sources.find((source) => source.useForSnapshot);
  }

  public get snapshotSource(): CameraDeviceSource | undefined {
    return this.designatedSnapshotSource ?? this.lowResolutionSource ?? this.midResolutionSource ?? this.highResolutionSource;
  }

  public getSourceById(id: string): CameraDeviceSource | undefined {
    return this.sources.find((source) => source._id === id);
  }

  public async getSnapshot(forceNew?: boolean): Promise<ArrayBuffer | undefined> {
    return this.snapshotSource?.snapshot(forceNew);
  }

  public abstract createStorage<T extends Record<string, any> = Record<string, any>>(schemas: JsonSchema[]): DeviceStorage<T>;

  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;

  public abstract addSensor<T extends object>(sensor: Sensor<T>): Promise<void>;
  public abstract removeSensor(sensorId: string): Promise<void>;

  public abstract implement(impl: CameraImplementation): Promise<void>;

  public onPropertyChange<T extends keyof Camera>(property: T | T[]): Observable<{ property: T; oldData: Camera[T]; newData: Camera[T] }> {
    return this.cameraSubject.pipe(
      pairwise(),
      mergeMap(([oldCamera, newCamera]) => {
        const properties = Array.isArray(property) ? property : [property];
        return properties.map((prop) => ({
          property: prop,
          oldData: oldCamera[prop],
          newData: newCamera[prop],
        }));
      }),
      filter(({ oldData, newData }) => !isEqual(oldData, newData, true)),
      share({ connector: () => new ReplaySubject(1) }),
    );
  }

  protected get cameraObject(): Camera {
    return structuredClone(this.cameraSubject.getValue());
  }

  protected abstract cleanup(): void;

  protected removeAllListeners(): void {
    this.cameraSubject.complete();
    this.cameraState.complete();
    this.frameWorkerState.complete();
  }

  protected updateCamera(updatedCamera: Camera): void {
    this.cameraSubject.next(updatedCamera);
  }

  protected updateCameraState(state: boolean): void {
    this.cameraState.next(state);
  }

  protected updateFrameWorkerState(state: boolean): void {
    this.frameWorkerState.next(state);
  }

  #createStateObservable<T extends boolean | Camera>(stateSubject: BehaviorSubject<T>): Observable<T> {
    return stateSubject.pipe(distinctUntilChanged(), share({ connector: () => new ReplaySubject(1) }));
  }
}
