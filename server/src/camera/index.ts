import { isEqual, structuredClone, Subscribed } from '@camera.ui/common/utils';
import { BehaviorSubject, Disposable, distinctUntilChanged, filter, mergeMap, pairwise, ReplaySubject, share } from '@camera.ui/sdk';
import { TTLCache } from '@isaacs/ttlcache';

import type {
  Camera,
  CameraDetectionSettings,
  PtzAutotrackSettings,
  CameraDevice as CameraDeviceInterface,
  CameraDeviceSource,
  CameraFrameWorkerSettings,
  CameraImplementation,
  CameraInformation,
  CameraPluginInfo,
  CameraSource,
  CameraType,
  CameraUiSettings,
  DetectionEvent,
  DetectionEventType,
  DetectionLine,
  DetectionZone,
  DeviceStorage,
  JsonSchema,
  LoggerService,
  Observable,
  Sensor,
  SensorLike,
  SensorType,
  SnapshotSettings,
} from '@camera.ui/sdk';

export interface CachedSnapshot {
  data: ArrayBuffer;
  fetchedAt: number;
}

export abstract class CameraDevice extends Subscribed implements CameraDeviceInterface {
  public readonly cameraSubject: BehaviorSubject<Camera>;
  public readonly cameraState = new BehaviorSubject<boolean>(false);
  public readonly frameWorkerState = new BehaviorSubject<boolean>(false);

  public readonly onConnected = this.#createStateObservable(this.cameraState);
  public readonly onFrameWorkerConnected = this.#createStateObservable(this.frameWorkerState);

  public abstract readonly onSensorAdded: Observable<{ sensorId: string; sensorType: SensorType }>;
  public abstract readonly onSensorRemoved: Observable<{ sensorId: string; sensorType: SensorType }>;
  public abstract readonly onDetectionEvent: Observable<{ type: DetectionEventType; event: DetectionEvent }>;

  protected snapshotCache: TTLCache<string, CachedSnapshot>;

  protected readonly initialized = new BehaviorSubject<boolean>(false);
  protected readonly onInitialized = this.initialized.pipe(distinctUntilChanged(), share({ connector: () => new ReplaySubject(1) }));

  constructor(
    camera: Camera,
    public readonly logger: LoggerService,
  ) {
    super();

    this.cameraSubject = new BehaviorSubject(camera);

    this.snapshotCache = new TTLCache({
      max: 100,
      ttl: this.snapshotSettings.ttl * 1000,
    });
  }

  abstract get sources(): CameraDeviceSource[];

  get id(): string {
    return this.cameraSubject.getValue()._id;
  }

  get nativeId(): string | undefined {
    return this.cameraSubject.getValue().nativeId;
  }

  get pluginInfo(): CameraPluginInfo | undefined {
    const info = this.cameraSubject.getValue().pluginInfo;
    return info ? structuredClone(info) : undefined;
  }

  get connected(): boolean {
    return this.cameraState.getValue();
  }

  get frameWorkerConnected(): boolean {
    return this.frameWorkerState.getValue();
  }

  get disabled(): boolean {
    return this.cameraSubject.getValue().disabled;
  }

  get snooze(): boolean {
    return this.cameraSubject.getValue().detectionSettings?.snooze ?? false;
  }

  get name(): string {
    return this.cameraSubject.getValue().name;
  }

  get room(): string {
    return this.cameraSubject.getValue().room;
  }

  get type(): CameraType {
    return this.cameraSubject.getValue().type;
  }

  get info(): CameraInformation {
    return structuredClone(this.cameraSubject.getValue().info);
  }

  get isCloud(): boolean {
    return this.cameraSubject.getValue().isCloud;
  }

  get snapshotSettings(): SnapshotSettings {
    return structuredClone(this.cameraSubject.getValue().snapshotSettings);
  }

  get detectionZones(): DetectionZone[] {
    return structuredClone(this.cameraSubject.getValue().detectionZones);
  }

  get detectionLines(): DetectionLine[] {
    return structuredClone(this.cameraSubject.getValue().detectionLines ?? []);
  }

  get detectionSettings(): CameraDetectionSettings {
    return structuredClone(this.cameraSubject.getValue().detectionSettings);
  }

  get ptzAutotrack(): PtzAutotrackSettings {
    return structuredClone(this.cameraSubject.getValue().ptzAutotrack);
  }

  get frameWorkerSettings(): CameraFrameWorkerSettings {
    return structuredClone(this.cameraSubject.getValue().frameWorkerSettings);
  }

  get interfaceSettings(): CameraUiSettings {
    return structuredClone(this.cameraSubject.getValue().interfaceSettings);
  }

  get streamSource(): CameraDeviceSource {
    return (this.highResolutionSource ?? this.midResolutionSource ?? this.lowResolutionSource)!;
  }

  get highResolutionSource(): CameraDeviceSource | undefined {
    return this.sources.find((source) => source.role === 'high-resolution');
  }

  get midResolutionSource(): CameraDeviceSource | undefined {
    return this.sources.find((source) => source.role === 'mid-resolution');
  }

  get lowResolutionSource(): CameraDeviceSource | undefined {
    return this.sources.find((source) => source.role === 'low-resolution');
  }

  get snapshotSource(): CameraSource | undefined {
    return this.sources.find((source) => source.role == 'snapshot') ?? this.sources.find((source) => source.useForSnapshot);
  }

  public getSourceById(id: string): CameraDeviceSource | undefined {
    return this.sources.find((source) => source._id === id);
  }

  public abstract createStorage<T extends Record<string, any> = Record<string, any>>(schemas: JsonSchema[]): DeviceStorage<T>;

  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;

  public abstract getSensors(): SensorLike[];
  public abstract getSensor(sensorId: string): SensorLike | undefined;
  public abstract getSensorsByType(type: SensorType): SensorLike[];

  public abstract addSensor<T extends object>(sensor: Sensor<T>): Promise<void>;
  public abstract removeSensor(sensorId: string): Promise<void>;

  public abstract implement(impl: CameraImplementation): Promise<void>;

  public onSensorProperty<T = unknown>(sensorType: SensorType, property: string, callback: (value: T, timestamp: number, sensor: SensorLike) => void): Disposable {
    let propertySub: Disposable | undefined;

    const subscribeTo = (sensor: SensorLike) => {
      propertySub?.dispose();
      propertySub = sensor.onPropertyChanged.subscribe(({ property: p, value, timestamp }) => {
        if (p === property) callback(value as T, timestamp, sensor);
      });
    };

    const existing = this.getSensorsByType(sensorType)[0];
    if (existing) subscribeTo(existing);

    const addedSub = this.onSensorAdded.subscribe(({ sensorType: type }) => {
      if (type === sensorType) {
        const sensor = this.getSensorsByType(sensorType)[0];
        if (sensor) subscribeTo(sensor);
      }
    });

    const removedSub = this.onSensorRemoved.subscribe(({ sensorType: type }) => {
      if (type === sensorType) {
        propertySub?.dispose();
        propertySub = undefined;
      }
    });

    return new Disposable(() => {
      propertySub?.dispose();
      addedSub.dispose();
      removedSub.dispose();
    });
  }

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
    this.snapshotCache.clear();
  }

  protected updateCamera(updatedCamera: Camera): void {
    if (updatedCamera.snapshotSettings.ttl !== this.snapshotSettings.ttl) {
      this.snapshotCache = new TTLCache({
        max: 100,
        ttl: updatedCamera.snapshotSettings.ttl * 1000,
      });
    }

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
