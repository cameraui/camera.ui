import { isEqual } from '@camera.ui/common/utils';
import { Disposable, Observable, Subject } from '@camera.ui/sdk';

import { CameraDevice } from '../../../../camera/index.js';
import { Fmp4Session } from '../../../../camera/streaming/fmp4-session.js';
import { RtpSession } from '../../../../camera/streaming/rtp-session.js';
import { NamespaceManager } from '../../../../rpc/namespaces.js';
import { getDetectionTypes } from '../../../../sensors/types.js';
import { buildSnapshotUrl, buildTargetUrl } from '../../../../utils/camera.js';
import { rewriteSourceUrlsForRemote } from '../remoteUrls.js';
import { limitRegistration } from './limiter.js';

import type { Logger } from '@camera.ui/common';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  Camera,
  CameraConfigInputSettings,
  CameraDeviceSource,
  CameraImplementation,
  CameraInput,
  DetectionEvent,
  DetectionEventType,
  DeviceStorage,
  JsonSchema,
  ModelSpec,
  PluginInfo,
  ProbeConfig,
  ProbeStream,
  RTSPUrlOptions,
  Sensor,
  SensorType,
  SnapshotUrlOptions,
} from '@camera.ui/sdk';
import type { DetectionEventMessage, SensorJSON } from '@camera.ui/sdk/internal';
import type { DetectionCoordinatorInterface } from '../../../../rpc/interfaces/detection.js';
import type {
  CameraDeviceInterface,
  CameraDeviceListenerMessagePayload,
  CameraSourceChange,
  DeviceManagerInterface,
  RefreshedStates,
} from '../../../../rpc/interfaces/device.js';
import type { SensorRegistryInterface } from '../../../../rpc/interfaces/sensor.js';
import type { CameraNamespaces, FrameWorkerDetectionNamespaces, PluginCameraNamespaces, SensorRegistryNamespaces } from '../../../../rpc/namespaces.js';
import type { StorageController } from '../storageController.js';
import type { SensorManagerProxy } from './sensorManager.js';

const DETECTION_SENSOR_TYPES: ReadonlySet<SensorType> = new Set(getDetectionTypes());

export class CameraDeviceProxy extends CameraDevice {
  readonly onDetectionEvent: Observable<{ type: DetectionEventType; event: DetectionEvent }>;

  #proxy: RPCClient;
  #namespaces: CameraNamespaces & FrameWorkerDetectionNamespaces & PluginCameraNamespaces & SensorRegistryNamespaces;

  #plugin: PluginInfo;
  #storageController: StorageController;
  #sensorManager: SensorManagerProxy;
  #eventSubscriptions = new Map<string, () => void>();
  #refreshing: Promise<void> = Promise.resolve();
  #detectionWire?: Promise<(() => void) | undefined>;
  #detectionSubscriberCount = 0;
  #ownedSensors = new Map<string, { sensor: Sensor<any>; type: SensorType }>();
  #connectWanted = false;
  #sensorCleanupFunctions = new Map<string, () => Promise<void>>();
  #implCleanupFunction?: () => Promise<void>;

  readonly #detectionEventSubject = new Subject<{ type: DetectionEventType; event: DetectionEvent }>();

  constructor(proxy: RPCClient, storageController: StorageController, sensorManager: SensorManagerProxy, camera: Camera, plugin: PluginInfo, logger: Logger) {
    super(camera, logger);

    this.onDetectionEvent = new Observable((callback) => {
      if (this.#detectionEventSubject.closed) {
        return new Disposable(() => {});
      }

      const sub = this.#detectionEventSubject.subscribe(callback);
      this.#detectionSubscriberCount++;
      this.#ensureDetectionWire();

      return new Disposable(() => {
        sub.dispose();
        this.#detectionSubscriberCount--;
        if (this.#detectionSubscriberCount === 0) {
          this.#dropDetectionWire();
        }
      });
    });

    this.#plugin = plugin;
    this.#proxy = proxy;
    this.#storageController = storageController;
    this.#sensorManager = sensorManager;

    this.#namespaces = {
      ...NamespaceManager.cameraNamespaces(camera._id),
      ...NamespaceManager.frameWorkerDetectionNamespaces(camera._id),
      ...NamespaceManager.pluginCameraNamespaces(plugin.id, camera._id),
      ...NamespaceManager.sensorRegistryNamespaces(),
    };

    this.addSubscriptions(
      this.onPropertyChange('name').subscribe(() => {
        (this.logger as Logger).suffix = this.name;
      }),
    );
  }

  get #cameraControllerProxy(): Promisify<CameraDeviceInterface> {
    return this.#proxy.createProxy<CameraDeviceInterface>(this.#namespaces.cameraControllerRpc);
  }

  get #deviceManagerProxy(): Promisify<DeviceManagerInterface> {
    return this.#proxy.createProxy<DeviceManagerInterface>(NamespaceManager.deviceManagerNamespaces().deviceManagerRpc);
  }

  get #sensorRegistryProxy(): Promisify<SensorRegistryInterface> {
    return this.#proxy.createProxy<SensorRegistryInterface>(this.#namespaces.sensorsRpc);
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

  public async init(): Promise<void> {
    if (this.initialized.value) {
      return;
    }

    this.initialized.next(true);

    await this._refreshStates();
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

    this.#connectWanted = true;
    return this.#cameraControllerProxy.connect();
  }

  public async disconnect(): Promise<void> {
    if (this.pluginInfo?.id !== this.#plugin.id) {
      return;
    }

    this.#connectWanted = false;
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
    for (const unsubscribe of this.#eventSubscriptions.values()) unsubscribe();
    this.#eventSubscriptions.clear();
    this.#dropDetectionWire();

    this.#detectionEventSubject.complete();

    await Promise.all([this.#implCleanupFunction?.(), ...Array.from(this.#sensorCleanupFunctions.values(), (cleanup) => cleanup())]);
    this.#implCleanupFunction = undefined;
    this.#sensorCleanupFunctions.clear();

    for (const { sensor } of this.#ownedSensors.values()) {
      this.#sensorManager._untrackCameraSensor(sensor.id);
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

  public async addSource(source: CameraConfigInputSettings): Promise<CameraDeviceSource> {
    this.#assertSourceOwner();
    const change = await this.#deviceManagerProxy.addCameraSource(this.#plugin.id, this.id, source);
    this.#applySourceChange(change);

    const added = change.sourceId ? this.getSourceById(change.sourceId) : undefined;
    if (!added) {
      throw new Error(`Source "${source.name}" missing after it was added`);
    }
    return added;
  }

  public async removeSource(sourceId: string): Promise<void> {
    this.#assertSourceOwner();
    const change = await this.#deviceManagerProxy.removeCameraSource(this.#plugin.id, this.id, sourceId);
    this.#applySourceChange(change);
  }

  #assertSourceOwner(): void {
    if (this.pluginInfo?.id !== this.#plugin.id) {
      throw new Error(`Only the plugin that controls camera "${this.name}" can change its sources`);
    }
  }

  // the camera update event follows on its own; applying the answer now lets callers read the new sources right away
  #applySourceChange(change: CameraSourceChange): void {
    super.updateCamera(change.camera);
  }

  public addSensor<T extends object>(sensor: Sensor<T>): Promise<void> {
    return limitRegistration(() => this.#addSensor(sensor));
  }

  public async removeSensor(sensorId: string): Promise<void> {
    this.#sensorManager._untrackCameraSensor(sensorId);
    await this.#sensorRegistryProxy.unregisterSensor(sensorId);

    await this.#sensorCleanupFunctions.get(sensorId)?.();
    this.#sensorCleanupFunctions.delete(sensorId);

    const ownedSensor = this.#ownedSensors.get(sensorId);
    if (ownedSensor) {
      ownedSensor.sensor._cleanup?.();
      this.#ownedSensors.delete(sensorId);
    }
  }

  public _refreshStates(): Promise<void> {
    const run = this.#refreshing.then(() => this.#refreshStates());
    this.#refreshing = run.catch(() => {});
    return run;
  }

  public async _reattach(): Promise<void> {
    for (const { sensor } of [...this.#ownedSensors.values()]) {
      const registration = await this.#sensorRegistryProxy.registerSensor(this.#registrationJson(sensor, true), this.#plugin.id, { assignCameraId: this.id });
      sensor._setAssignedCameras(registration.assignedCameraIds);
    }
    if (this.#connectWanted) {
      await this.#cameraControllerProxy.connect();
    }
    await this._refreshStates();
  }

  async #addSensor<T extends object>(sensor: Sensor<T>): Promise<void> {
    sensor._setPluginId(this.#plugin.id);

    const sensorJSON = this.#registrationJson(sensor, false);

    // resolve the id and wire storage first, modelSpec in the registration reads sensor storage
    const sensorId = await this.#sensorRegistryProxy.resolveSensor(sensorJSON, this.#plugin.id, { assignCameraId: this.id });
    sensor._setId(sensorId);
    sensorJSON.id = sensorId;

    const storage = this.#storageController.createSensorStorage(this.#plugin.id, sensor.id, sensor.storageSchema ?? []);
    await storage.registerStorage();
    sensor._setStorage(storage);

    const modelSpec: ModelSpec | undefined = (sensor as { modelSpec?: ModelSpec }).modelSpec;
    if (modelSpec) {
      sensorJSON.modelSpec = modelSpec;
    }

    const registration = await this.#sensorRegistryProxy.registerSensor(sensorJSON, this.#plugin.id, { assignCameraId: this.id });
    sensor._setAssignedCameras(registration.assignedCameraIds);
    sensor._setAssignmentLocked?.();

    await this.#sensorManager._trackCameraSensor(sensor);

    const sensorNamespace = NamespaceManager.sensorProviderNamespaces(this.#plugin.id, sensor.id).sensorRpc;

    const pushProperties = async (properties: Record<string, unknown>): Promise<void> => {
      const sensorType = sensor.type;
      if (DETECTION_SENSOR_TYPES.has(sensorType)) {
        // modelSpec belongs to the registry, the coordinator gets it with the next sensor push
        const { modelSpec, ...rest } = properties;
        if (modelSpec) {
          await this.#sensorRegistryProxy.updateModelSpec(sensor.id, modelSpec as ModelSpec);
          if (Object.keys(rest).length === 0) return;
          properties = rest;
        }

        if (!this.frameWorkerState.getValue()) return;
        try {
          await this.#detectionCoordinatorProxy.reportSensorWrite(sensor.id, sensorType, properties);
        } catch (error) {
          this.logger.warn(`Failed to forward sensor write to coordinator for ${sensor.id}:`, error);
        }
        return;
      }
      await this.#sensorRegistryProxy.updatePropertyValues(sensor.id, properties);
    };

    // fire-and-forget for the sensor author, a failed RPC must not become an unhandled rejection
    sensor._init((properties) => {
      pushProperties(properties).then(
        () => this.#sensorManager._settleWrite(sensor, properties, true),
        (error) => {
          this.#sensorManager._settleWrite(sensor, properties, false);
          this.logger.debug(`Property write for sensor ${sensor.id} failed:`, error);
        },
      );
    });

    sensor._initSource((patch) => {
      this.#sensorRegistryProxy.updateSource(sensor.id, patch).catch((error) => this.logger.debug(`Source write for sensor ${sensor.id} failed:`, error));
    });

    sensor._initCapabilities((capabilities) => {
      this.#sensorRegistryProxy
        .updateCapabilities(sensor.id, capabilities)
        .catch((error) => this.logger.debug(`Capability write for sensor ${sensor.id} failed:`, error));
    });

    const sensorCleanup = await this.#proxy.registerHandler(sensorNamespace, sensor, {
      withoutDecorators: true,
      concurrency: (sensor as { _rpcConcurrency?: Record<string, number> })._rpcConcurrency,
    });
    this.#sensorCleanupFunctions.set(sensor.id, sensorCleanup);

    this.#ownedSensors.set(sensor.id, { sensor, type: sensor.type });

    const sensorEventNamespace = NamespaceManager.sensorEventNamespaces(sensor.id);
    // frame-fed owners skip the echo of their per-frame detection writes
    const eventSubject = registration.stateSubject && sensorJSON.requiresFrames ? sensorEventNamespace.sensorStateSubject : sensorEventNamespace.sensorSubject;
    const unsubscribeBackendEvents = await this.#proxy.subscribe<{ type: string; data: unknown }>(eventSubject, (event) => {
      if (event.type === 'property:changed') {
        const changeEvent = event.data as { property: string; value: unknown; timestamp?: number };
        sensor._onBackendPropertyChanged(changeEvent.property, changeEvent.value, changeEvent.timestamp);
      }
    });

    const rpcCleanup = this.#sensorCleanupFunctions.get(sensor.id);
    this.#sensorCleanupFunctions.set(sensor.id, async () => {
      unsubscribeBackendEvents();
      await rpcCleanup?.();
    });

    sensor._setActive(true);
  }

  #registrationJson(sensor: Sensor<any>, withModelSpec: boolean): SensorJSON {
    const sensorJSON = sensor.toJSON();
    sensorJSON.requiresFrames = sensor._requiresFrames === true;
    // derived nativeId keeps per-camera instances of same-named sensors distinct
    sensorJSON.nativeId ??= `${this.id}:${sensor.type}:${sensor.name}`;
    const modelSpec: ModelSpec | undefined = withModelSpec ? (sensor as { modelSpec?: ModelSpec }).modelSpec : undefined;
    if (modelSpec) {
      sensorJSON.modelSpec = modelSpec;
    }
    return sensorJSON;
  }

  #ensureDetectionWire(): void {
    if (this.#detectionWire) {
      return;
    }

    const detectionNs = NamespaceManager.detectionEventNamespaces(this.id);
    const wire = this.#proxy
      .subscribe<DetectionEventMessage>(detectionNs.detectionEventSubject, (message) => {
        this.#detectionEventSubject.next({ type: message.type, event: message.data });
      })
      .catch((error) => {
        this.logger.error('Failed to subscribe to detection events', error);
        if (this.#detectionWire === wire) {
          this.#detectionWire = undefined;
        }
        return undefined;
      });

    this.#detectionWire = wire;
  }

  #dropDetectionWire(): void {
    const wire = this.#detectionWire;
    this.#detectionWire = undefined;
    wire?.then((close) => close?.());
  }

  async #refreshStates(): Promise<void> {
    if (!this.initialized.value) return;

    if (this.#eventSubscriptions.size === 0) {
      // both until the controller tells which one it publishes
      await this.#subscribeEvents(this.#namespaces.cameraSubject);
      await this.#subscribeEvents(this.#namespaces.cameraStateSubject);
    }

    let response = await this.#applyStates();
    const subject = response.stateSubject ? this.#namespaces.cameraStateSubject : this.#namespaces.cameraSubject;
    if (!this.#eventSubscriptions.has(subject)) {
      await this.#subscribeEvents(subject);
      // re-read to cover what the old subject missed
      response = await this.#applyStates();
    }

    for (const [other, unsubscribe] of this.#eventSubscriptions) {
      if (other === subject) continue;
      unsubscribe();
      this.#eventSubscriptions.delete(other);
    }
  }

  async #applyStates(): Promise<RefreshedStates> {
    const response: RefreshedStates = await this.#cameraControllerProxy.refreshStates();

    // a resync must not wake subscribers for state they already hold
    if (!isEqual(this.cameraSubject.getValue(), response.camera)) {
      super.updateCamera(response.camera);
    }
    if (this.cameraState.getValue() !== response.cameraState) {
      super.updateCameraState(response.cameraState);
    }
    if (this.frameWorkerState.getValue() !== response.frameWorkerState) {
      super.updateFrameWorkerState(response.frameWorkerState);
    }

    return response;
  }

  async #subscribeEvents(subject: string): Promise<void> {
    const unsubscribe = await this.#proxy.subscribe<CameraDeviceListenerMessagePayload>(subject, this.#onEventMessage.bind(this));
    // cleaned up while the subscribe was in flight
    if (!this.initialized.value) {
      unsubscribe();
      return;
    }
    this.#eventSubscriptions.set(subject, unsubscribe);
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
}
