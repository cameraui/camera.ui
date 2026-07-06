import { API_EVENT, Subject } from '@camera.ui/sdk';

import { CameraDevice } from '../../../../camera/index.js';
import { getDetectionTypes } from '../../../../camera/sensors/types.js';
import { Fmp4Session } from '../../../../camera/streaming/fmp4-session.js';
import { RtpSession } from '../../../../camera/streaming/rtp-session.js';
import { NamespaceManager } from '../../../../rpc/namespaces.js';
import { buildSnapshotUrl, buildTargetUrl } from '../../../../utils/camera.js';
import { rewriteSourceUrlsForRemote } from '../remoteUrls.js';
import { SensorProxy } from './sensor.js';

import type { Logger } from '@camera.ui/common';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  Camera,
  CameraDeviceSource,
  CameraImplementation,
  CameraInput,
  DetectionEvent,
  DetectionEventType,
  DeviceStorage,
  JsonSchema,
  ModelSpec,
  Observable,
  PluginContract,
  PluginInfo,
  ProbeConfig,
  ProbeStream,
  RTSPUrlOptions,
  Sensor,
  SensorLike,
  SensorType,
  SnapshotUrlOptions,
} from '@camera.ui/sdk';
import type { DetectionEventMessage } from '@camera.ui/sdk/internal';
import type { EventEmitter } from 'node:events';
import type { DetectionCoordinatorInterface } from '../../../../rpc/interfaces/detection.js';
import type { CameraDeviceInterface, CameraDeviceListenerMessagePayload, RefreshedStates } from '../../../../rpc/interfaces/device.js';
import type { SensorControllerInterface, StoredSensorData } from '../../../../rpc/interfaces/sensor.js';
import type { CameraNamespaces, FrameWorkerDetectionNamespaces, PluginCameraNamespaces, SensorControllerNamespaces } from '../../../../rpc/namespaces.js';
import type { PluginAPI } from '../pluginApi.js';
import type { StorageController } from '../storageController.js';

const DETECTION_SENSOR_TYPES: ReadonlySet<SensorType> = new Set(getDetectionTypes());

export class CameraDeviceProxy extends CameraDevice {
  readonly onSensorAdded: Observable<{ sensorId: string; sensorType: SensorType }>;
  readonly onSensorRemoved: Observable<{ sensorId: string; sensorType: SensorType }>;
  readonly onDetectionEvent: Observable<{ type: DetectionEventType; event: DetectionEvent }>;

  #proxy: RPCClient;
  #namespaces: CameraNamespaces & FrameWorkerDetectionNamespaces & PluginCameraNamespaces & SensorControllerNamespaces;

  #api: EventEmitter;
  #plugin: PluginInfo;
  #contract: PluginContract;
  #storageController: StorageController;
  #closeSubscription?: () => void;
  #closeSensorSubscription?: () => void;
  #closeDetectionSubscription?: () => void;
  #sensors = new Map<string, SensorProxy>();
  #ownedSensors = new Map<string, { sensor: Sensor<any>; type: SensorType }>();
  #sensorCleanupFunctions = new Map<string, () => Promise<void>>();
  #implCleanupFunction?: () => Promise<void>;

  readonly #sensorAddedSubject = new Subject<{ sensorId: string; sensorType: SensorType }>();
  readonly #sensorRemovedSubject = new Subject<{ sensorId: string; sensorType: SensorType }>();
  readonly #detectionEventSubject = new Subject<{ type: DetectionEventType; event: DetectionEvent }>();

  constructor(proxy: RPCClient, api: PluginAPI, storageController: StorageController, camera: Camera, plugin: PluginInfo, logger: Logger) {
    super(camera, logger);

    this.onSensorAdded = this.#sensorAddedSubject.asObservable();
    this.onSensorRemoved = this.#sensorRemovedSubject.asObservable();
    this.onDetectionEvent = this.#detectionEventSubject.asObservable();

    this.#api = api;
    this.#plugin = plugin;
    this.#contract = plugin.contract;
    this.#proxy = proxy;
    this.#storageController = storageController;

    this.#namespaces = {
      ...NamespaceManager.cameraNamespaces(camera._id),
      ...NamespaceManager.frameWorkerDetectionNamespaces(camera._id),
      ...NamespaceManager.pluginCameraNamespaces(plugin.id, camera._id),
      ...NamespaceManager.sensorControllerNamespaces(camera._id),
    };

    this.#api.setMaxListeners(this.#api.getMaxListeners() + 1);
    this.#api.once(API_EVENT.SHUTDOWN, this.cleanup.bind(this));

    this.addSubscriptions(
      this.onPropertyChange('name').subscribe(() => {
        (this.logger as Logger).suffix = this.name;
      }),
    );
  }

  get #cameraControllerProxy(): Promisify<CameraDeviceInterface> {
    return this.#proxy.createProxy<CameraDeviceInterface>(this.#namespaces.cameraControllerRpc);
  }

  get #sensorControllerProxy(): Promisify<SensorControllerInterface> {
    return this.#proxy.createProxy<SensorControllerInterface>(this.#namespaces.sensorRpc);
  }

  get #detectionCoordinatorProxy(): Promisify<DetectionCoordinatorInterface> {
    return this.#proxy.createProxy<DetectionCoordinatorInterface>(this.#namespaces.detectionRpc);
  }

  get sources(): CameraDeviceSource[] {
    const sources: CameraInput[] = JSON.parse(JSON.stringify(this.cameraSubject.getValue().sources));

    return sources.map((source): CameraDeviceSource => {
      source.urls = rewriteSourceUrlsForRemote(source.urls);

      return {
        ...source,
        generateRTSPUrl: (options: RTSPUrlOptions): string => {
          return buildTargetUrl(source.urls.rtsp.base, options);
        },
        generateSnapshotUrl: (options: SnapshotUrlOptions): string => {
          return buildSnapshotUrl(this.name, source.name, source.urls.snapshot.jpeg, options);
        },
        snapshot: (forceNew): Promise<ArrayBuffer | undefined> => {
          return this.snapshot(source._id, forceNew);
        },
        probeStream: (probeConfig?: ProbeConfig, refresh = false): Promise<ProbeStream | undefined> => {
          return this.probeStream(source._id, probeConfig, refresh);
        },
        getStreamStatus: (): Promise<string> => {
          return this.#cameraControllerProxy.getStreamStatus(source._id).catch(() => 'idle');
        },
        createRtpSession: (urlOrOptions?: string | RTSPUrlOptions): RtpSession => {
          return new RtpSession(this, source, urlOrOptions);
        },
        createFmp4Session: (urlOrOptions?: string | RTSPUrlOptions): Fmp4Session => {
          return new Fmp4Session(this, source, urlOrOptions);
        },
      };
    });
  }

  #canAccessSensor(sensor: StoredSensorData): boolean {
    if (sensor.pluginId === this.#plugin.id) return true;

    // Foreign sensors require consumes declaration
    return this.#contract.consumes.includes(sensor.type);
  }

  public async init(): Promise<void> {
    if (this.initialized.value) {
      return;
    }

    this.initialized.next(true);

    this.#closeSubscription = await this.#proxy.subscribe<CameraDeviceListenerMessagePayload>(this.#namespaces.cameraSubject, this.#onEventMessage.bind(this));
    this.#closeSensorSubscription = await this.#proxy.subscribe<{ type: string; data: unknown }>(this.#namespaces.sensorSubject, this.#onGlobalSensorEvent.bind(this));

    const detectionNs = NamespaceManager.detectionEventNamespaces(this.id);
    this.#closeDetectionSubscription = await this.#proxy.subscribe<DetectionEventMessage>(detectionNs.detectionEventSubject, (message) => {
      this.#detectionEventSubject.next({ type: message.type, event: message.data });
    });

    await this.#refreshStates();

    await this.#initializeSensors();
  }

  public async implement(impl: CameraImplementation): Promise<void> {
    const namespace = NamespaceManager.pluginCameraNamespaces(this.#plugin.id, this.id);
    this.#implCleanupFunction = await this.#proxy.registerHandler(namespace.cameraImplRpc, impl, { withoutDecorators: true });
  }

  public async streamUrl(sourceId: string): Promise<string | undefined> {
    return this.#cameraControllerProxy.streamUrl(sourceId);
  }

  public async connect(): Promise<void> {
    if (this.pluginInfo?.id !== this.#plugin.id) {
      return;
    }

    return this.#cameraControllerProxy.connect();
  }

  public async disconnect(): Promise<void> {
    if (this.pluginInfo?.id !== this.#plugin.id) {
      return;
    }

    return this.#cameraControllerProxy.disconnect();
  }

  public createStorage<T extends Record<string, any> = Record<string, any>>(schemas: JsonSchema[]): DeviceStorage<T> {
    const storage = this.#storageController.createCameraStorage<T>(this.id, schemas);
    return storage;
  }

  public async cleanup(): Promise<void> {
    this.initialized.next(false);
    this.removeAllListeners();
    this.unsubscribe();
    this.#api.removeListener(API_EVENT.SHUTDOWN, this.cleanup.bind(this));
    this.#api.setMaxListeners(this.#api.getMaxListeners() - 1);
    this.#closeSubscription?.();
    this.#closeSensorSubscription?.();
    this.#closeDetectionSubscription?.();

    this.#sensorAddedSubject.complete();
    this.#sensorRemovedSubject.complete();
    this.#detectionEventSubject.complete();

    await this.#implCleanupFunction?.();
    this.#implCleanupFunction = undefined;

    for (const cleanup of this.#sensorCleanupFunctions.values()) {
      await cleanup();
    }
    this.#sensorCleanupFunctions.clear();

    for (const sensor of this.#sensors.values()) {
      sensor._unsubscribeFromEvents();
    }

    this.#sensors.clear();

    for (const { sensor } of this.#ownedSensors.values()) {
      sensor._cleanup?.();
    }
    this.#ownedSensors.clear();
  }

  protected async snapshot(sourceId: string, forceNew?: boolean): Promise<ArrayBuffer | undefined> {
    return this.#cameraControllerProxy.snapshot(sourceId, forceNew);
  }

  protected async probeStream(sourceId: string, probeConfig?: ProbeConfig, refresh = false) {
    return this.#cameraControllerProxy.probeStream(sourceId, probeConfig, refresh);
  }

  public getSensors(): SensorLike[] {
    const ownedSensors = Array.from(this.#ownedSensors.values()).map((entry) => entry.sensor as SensorLike);
    const proxySensors = Array.from(this.#sensors.values());
    return [...ownedSensors, ...proxySensors];
  }

  public getSensor(sensorId: string): SensorLike | undefined {
    const owned = this.#ownedSensors.get(sensorId);
    if (owned) {
      return owned.sensor as SensorLike;
    }
    return this.#sensors.get(sensorId);
  }

  public getSensorsByType(type: SensorType): SensorLike[] {
    return this.getSensors().filter((s) => s.type === type);
  }

  public async addSensor<T extends object>(sensor: Sensor<T>): Promise<void> {
    sensor._setCameraId(this.id);
    sensor._setPluginId(this.#plugin.id);

    const sensorNamespace = NamespaceManager.sensorProviderNamespaces(this.#plugin.id, this.id, sensor.id).sensorRpc;

    sensor._init(async (properties: Record<string, unknown>) => {
      const sensorType = sensor.type;
      if (DETECTION_SENSOR_TYPES.has(sensorType)) {
        if (!this.frameWorkerState.getValue()) return;
        try {
          await this.#detectionCoordinatorProxy.reportSensorWrite(sensor.id, sensorType, properties);
        } catch (error) {
          this.logger.warn(`Failed to forward sensor write to coordinator for ${sensor.id}:`, error);
        }
        return;
      }
      await this.#sensorControllerProxy.updatePropertyValues(sensor.id, properties);
    });

    sensor._initCapabilities(async (capabilities: string[]) => {
      await this.#sensorControllerProxy.updateCapabilities(sensor.id, capabilities);
    });

    // Storage key is based on (cameraId, sensorType, pluginId, sensorName) for persistence;
    // RPC namespace is based on sensor.id (UUID) for runtime communication.
    const schemas = sensor.storageSchema ?? [];
    const storage = this.#storageController.createSensorStorage(this.id, sensor.type, this.#plugin.id, sensor.name, sensor.id, schemas);
    await storage.registerStorage();

    const savedDisplayName = storage.values._displayName as string | undefined;
    sensor.setDisplayName(savedDisplayName ?? sensor.name);

    sensor._setStorage(storage);

    const requiresFrames = sensor._requiresFrames === true;

    const modelSpec: ModelSpec | undefined = (sensor as { modelSpec?: ModelSpec }).modelSpec;

    const sensorCleanup = await this.#proxy.registerHandler(sensorNamespace, sensor, { withoutDecorators: true });
    this.#sensorCleanupFunctions.set(sensor.id, sensorCleanup);

    const sensorJSON = sensor.toJSON();

    sensorJSON.requiresFrames = requiresFrames;

    if (modelSpec) {
      sensorJSON.modelSpec = modelSpec;
    }

    const isAssigned = await this.#cameraControllerProxy.registerSensor(sensorJSON, this.#plugin.id);

    sensor._setAssigned(isAssigned);

    this.#ownedSensors.set(sensor.id, { sensor, type: sensor.type });

    // Subscribe to backend-initiated property changes for the owned sensor so that
    // backend updates (e.g., motion dwell timer) sync into the local sensor state.
    const sensorEventNamespace = NamespaceManager.sensorEventNamespaces(this.id, sensor.id);
    const unsubscribeBackendEvents = await this.#proxy.subscribe<{ type: string; data: unknown }>(sensorEventNamespace.sensorSubject, (event) => {
      if (event.type === 'property:changed') {
        const changeEvent = event.data as { property: string; value: unknown };
        sensor._onBackendPropertyChanged(changeEvent.property, changeEvent.value);
      }
    });

    const rpcCleanup = this.#sensorCleanupFunctions.get(sensor.id);
    this.#sensorCleanupFunctions.set(sensor.id, async () => {
      unsubscribeBackendEvents();
      await rpcCleanup?.();
    });
  }

  public async removeSensor(sensorId: string): Promise<void> {
    await this.#cameraControllerProxy.unregisterSensor(sensorId);

    await this.#sensorCleanupFunctions.get(sensorId)?.();
    this.#sensorCleanupFunctions.delete(sensorId);

    const ownedSensor = this.#ownedSensors.get(sensorId);
    if (ownedSensor) {
      ownedSensor.sensor._cleanup?.();
      this.#ownedSensors.delete(sensorId);
    }

    // Defensive: shouldn't happen for owned sensors, but clean up any stray proxy.
    const proxy = this.#sensors.get(sensorId);
    if (proxy) {
      proxy._unsubscribeFromEvents();
      this.#sensors.delete(sensorId);
    }
  }

  async #refreshStates(): Promise<void> {
    const response: RefreshedStates = await this.#cameraControllerProxy.refreshStates();

    super.updateCamera(response.camera);
    super.updateCameraState(response.cameraState);
    super.updateFrameWorkerState(response.frameWorkerState);
  }

  async #onEventMessage(event: CameraDeviceListenerMessagePayload): Promise<void> {
    if (!this.initialized.value) {
      return;
    }

    switch (event.type) {
      case 'removed':
        this.cleanup();
        break;
      case 'updated':
        super.updateCamera(event.data);
        break;
      case 'cameraState':
        super.updateCameraState(event.data);
        break;
      case 'frameWorkerState':
        super.updateFrameWorkerState(event.data);
        break;
    }
  }

  async #initializeSensors(): Promise<void> {
    try {
      // Filter sensors based on contract.consumes via pluginId
      const sensors = await this.#sensorControllerProxy.getSensors(this.#plugin.id);
      const newlyAdded: SensorProxy[] = [];

      for (const sensorData of sensors) {
        if (this.#sensors.has(sensorData.id)) {
          continue;
        }

        const pluginId = sensorData.pluginId ?? this.#plugin.id;
        const ownerNamespace = NamespaceManager.sensorProviderNamespaces(pluginId, this.id, sensorData.id).sensorRpc;
        const proxy = new SensorProxy(sensorData, this.#proxy, ownerNamespace, this.id);
        this.#sensors.set(sensorData.id, proxy);
        newlyAdded.push(proxy);
      }

      const currentSensorIds = new Set(sensors.map((s) => s.id));
      for (const [sensorId, sensor] of this.#sensors) {
        if (!currentSensorIds.has(sensorId)) {
          sensor._unsubscribeFromEvents();
          this.#sensors.delete(sensorId);
        }
      }

      if (newlyAdded.length > 0) {
        await this.#getSensorStates(newlyAdded);
        for (const sensor of newlyAdded) {
          sensor._subscribeToEvents();
        }
      }
    } catch {
      // SensorController not available yet
    }
  }

  async #getSensorStates(sensors: SensorProxy[]): Promise<void> {
    try {
      const states = await this.#sensorControllerProxy.getSensorStates();
      for (const sensor of sensors) {
        const state = states[sensor.id];
        if (state) {
          sensor._applyRefreshedState(state);
        }
      }
    } catch {
      // SensorController not available
    }
  }

  #onGlobalSensorEvent(event: { type: string; data: unknown }): void {
    if (!this.initialized.value) {
      return;
    }

    switch (event.type) {
      case 'sensor:added': {
        const addedEvent = event.data as { sensor: StoredSensorData; state: { online: boolean; capabilities: string[] } };
        if (!this.#sensors.has(addedEvent.sensor.id)) {
          if (!this.#canAccessSensor(addedEvent.sensor)) {
            return;
          }
          const pluginId = addedEvent.sensor.pluginId ?? this.#plugin.id;
          const ownerNamespace = NamespaceManager.sensorProviderNamespaces(pluginId, this.id, addedEvent.sensor.id).sensorRpc;
          const proxy = new SensorProxy(addedEvent.sensor, this.#proxy, ownerNamespace, this.id);
          proxy._subscribeToEvents();
          this.#sensors.set(addedEvent.sensor.id, proxy);
        }

        this.#sensorAddedSubject.next({ sensorId: addedEvent.sensor.id, sensorType: addedEvent.sensor.type });
        break;
      }
      case 'sensor:removed': {
        const removedEvent = event.data as { sensorId: string; sensorType: SensorType };
        const sensor = this.#sensors.get(removedEvent.sensorId);
        if (sensor) {
          sensor._unsubscribeFromEvents();
        }
        this.#sensors.delete(removedEvent.sensorId);

        this.#sensorRemovedSubject.next({ sensorId: removedEvent.sensorId, sensorType: removedEvent.sensorType });
        break;
      }
      case 'sensor:assignment:changed': {
        const assignmentEvent = event.data as { cameraId: string; pluginId: string; sensorType: SensorType; assigned: boolean };
        if (assignmentEvent.pluginId === this.#plugin.id) {
          for (const [, entry] of this.#ownedSensors) {
            if (entry.type === assignmentEvent.sensorType) {
              entry.sensor._setAssigned(assignmentEvent.assigned);
            }
          }
        }
        break;
      }
    }
  }
}
