import { generateSdp } from '@camera.ui/common/camera';
import { isEqual, sleep } from '@camera.ui/common/utils';
import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { API_EVENT, filter, pairwise, SensorType, Subject } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { PLUGIN_STATUS } from '../plugins/types.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { buildSnapshotUrl, buildTargetUrl, createSourceName } from '../utils/camera.js';
import { FrameWorker } from './decoder/worker.js';
import { CameraDevice } from './index.js';
import { SensorController } from './sensors/controller.js';
import { getMultiProviderTypes, SENSOR_TYPE_CONFIG } from './sensors/types.js';
import { Fmp4Session } from './streaming/fmp4-session.js';
import { RtpSession } from './streaming/rtp-session.js';
import { generateAudioStreamInfo, generateVideoStreamInfo } from './utils.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  AudioStreamInfo,
  Camera,
  CameraDeviceSource,
  CameraImplementation,
  CameraInput,
  DetectionEvent,
  DetectionEventType,
  DeviceStorage,
  Disposable,
  Observable,
  PluginAssignments,
  ProbeConfig,
  ProbeStream,
  RTSPUrlOptions,
  Sensor,
  SensorLike,
  VideoStreamInfo,
} from '@camera.ui/sdk';
import type { DetectionEventMessage, SensorJSON } from '@camera.ui/sdk/internal';
import type { CameraUiAPI } from '../api.js';
import type { Go2RtcApi } from '../go2rtc/api/index.js';
import type { InternalEventBus } from '../internal-bus.js';
import type { ProxyServer } from '../rpc/index.js';
import type { CameraDeviceInterface, CameraDeviceListenerMessagePayload, RefreshedStates, SnapshotUpdatedEvent, SnapshotWithMeta } from '../rpc/interfaces/device.js';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { CameraNamespaces, FrameWorkerDetectionNamespaces } from '../rpc/namespaces.js';
import type { LoggerService } from '../services/logger/index.js';

@RPCClass
export class CameraController extends CameraDevice implements CameraDeviceInterface {
  public readonly frameWorker: FrameWorker;
  public readonly streamInfos = new Map<string, ProbeStream>();
  public readonly sensorController: SensorController;

  readonly #sensorAddedSubject = new Subject<{ sensorId: string; sensorType: SensorType }>();
  readonly #sensorRemovedSubject = new Subject<{ sensorId: string; sensorType: SensorType }>();
  readonly #detectionEventSubject = new Subject<{ type: DetectionEventType; event: DetectionEvent }>();

  public readonly onSensorAdded: Observable<{ sensorId: string; sensorType: SensorType }> = this.#sensorAddedSubject.asObservable();
  public readonly onSensorRemoved: Observable<{ sensorId: string; sensorType: SensorType }> = this.#sensorRemovedSubject.asObservable();
  public readonly onDetectionEvent: Observable<{ type: DetectionEventType; event: DetectionEvent }> = this.#detectionEventSubject.asObservable();

  private proxy: RPCClient;
  private namespaces: CameraNamespaces & FrameWorkerDetectionNamespaces;

  private go2rtcApi: Go2RtcApi;
  private loggerService: LoggerService;
  private api: CameraUiAPI;

  private closeProxy?: () => Promise<void>;
  private detectionEventUnsub?: () => void;
  private autoRefreshInterval?: NodeJS.Timeout;

  constructor(camera: Camera, logger: Logger) {
    super(camera, logger);

    this.api = container.resolve<CameraUiAPI>('api');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
    this.loggerService = container.resolve<LoggerService>('logger');
    this.proxy = container.resolve<ProxyServer>('proxy').proxy;

    this.frameWorker = new FrameWorker(this);
    this.sensorController = new SensorController(this, this.frameWorker, this.proxy);

    this.namespaces = {
      ...NamespaceManager.cameraNamespaces(camera._id),
      ...NamespaceManager.frameWorkerDetectionNamespaces(camera._id),
    };

    this.addSubscriptions(this.subscribeToCameraState(), this.subscribeToFrameWorkerState(), this.subscribeToCameraChanges());

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.cleanup();
    });

    this.initialized.next(true);
  }

  get logPath(): string {
    return this.loggerService.getCameraLogPath(this.id) ?? '';
  }

  get streamSource(): CameraDeviceSource {
    return (this.highResolutionSource ?? this.midResolutionSource ?? this.lowResolutionSource)!;
  }

  get camera(): Camera {
    return this.cameraObject;
  }

  get cameraDeviceProxy(): Promisify<CameraDeviceInterface & Partial<CameraImplementation>> | undefined {
    const pluginId = this.camera.pluginInfo?.id;
    if (!pluginId) {
      return undefined;
    }

    const namespace = NamespaceManager.pluginCameraNamespaces(pluginId, this.id);
    return this.proxy.createProxy<CameraDeviceInterface & Partial<CameraImplementation>>(namespace.cameraImplRpc);
  }

  get sources(): CameraDeviceSource[] {
    const sources: CameraInput[] = JSON.parse(JSON.stringify(this.cameraSubject.getValue().sources));

    return sources.map((source): CameraDeviceSource => {
      return {
        ...source,
        generateRTSPUrl: (options: RTSPUrlOptions): string => {
          return buildTargetUrl(source.urls.rtsp.base, options);
        },
        generateSnapshotUrl: (options: RTSPUrlOptions): string => {
          return buildSnapshotUrl(this.name, source.name, source.urls.snapshot.jpeg, options);
        },
        snapshot: (forceNew): Promise<ArrayBuffer | undefined> => {
          return this.snapshot(source._id, forceNew);
        },
        probeStream: (probeConfig?: ProbeConfig, refresh = false): Promise<ProbeStream | undefined> => {
          return this.probeStream(source._id, probeConfig, refresh);
        },
        getStreamStatus: (): Promise<string> => {
          return this.getStreamStatus(source._id);
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
    this.closeProxy = await this.proxy.registerHandler(this.namespaces.cameraControllerRpc, this, { isolatedConnection: true });
    await this.sensorController.init();

    const detectionEventSubject = NamespaceManager.detectionEventNamespaces(this.id).detectionEventSubject;
    this.detectionEventUnsub = await this.proxy.subscribe<DetectionEventMessage>(detectionEventSubject, (msg) => {
      this.#detectionEventSubject.next({ type: msg.type, event: msg.data });
    });

    if (this.disabled) {
      this.logger.log('Camera is disabled — skipping preload, auto-refresh, and stream startup');
      this.stopAllPreloads();
      return;
    }

    if (!this.pluginInfo) {
      await this.initialPreload();
      this.cameraState.next(true);
    }

    this.startAutoRefresh();
    this.preloadSources();
  }

  public removePluginSensors(pluginId: string): void {
    this.sensorController.removePluginSensors(pluginId);
  }

  public getSensorByType(sensorType: SensorType): StoredSensorData | undefined {
    return this.sensorController.getSensorByType(sensorType);
  }

  public createStorage<T extends Record<string, any> = Record<string, any>>(): DeviceStorage<T> {
    throw new Error('Method not implemented.');
  }

  public async implement(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  @RPCMethod
  public async connect(): Promise<void> {
    this.cameraState.next(true);
  }

  @RPCMethod
  public async disconnect(): Promise<void> {
    this.cameraState.next(false);
  }

  @RPCMethod
  public async snapshot(sourceId: string, forceNew?: boolean): Promise<ArrayBuffer | undefined> {
    this.snapshotCache.purgeStale();

    const fromCache = this.snapshotCache.get(sourceId);
    if (!forceNew && fromCache) {
      return fromCache.data;
    }

    const source = this.sources.find((source) => source._id === sourceId);
    if (!source) {
      throw new Error('Source not found');
    }

    const fetchSnapshotFromSource = async (s: CameraDeviceSource): Promise<ArrayBuffer | undefined> => {
      try {
        const sourceName = createSourceName(this.name, s.name);
        const snapshot = await this.go2rtcApi.snapshotRoute.jpeg({ src: sourceName, ...(forceNew ? { gop: 0 as const } : {}) });
        if (snapshot.byteLength > 0) {
          this.snapshotCache.set(s._id, { data: snapshot, fetchedAt: Date.now() });
        }

        return snapshot;
      } catch (error) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          this.logger.debug('Snapshot request timed out for', this.name);
        } else {
          this.logger.error('Error while fetching snapshot:', error.message);
        }
      }
    };

    const fetchSnapshotFromPlugin = async (s: CameraDeviceSource): Promise<ArrayBuffer | undefined> => {
      try {
        const pluginSnapshot = await this.cameraDeviceProxy?.snapshot?.(s._id, forceNew);
        if (pluginSnapshot && pluginSnapshot.byteLength > 0) {
          this.snapshotCache.set(s._id, { data: pluginSnapshot, fetchedAt: Date.now() });
          return pluginSnapshot;
        }
      } catch {
        // Ignore plugin errors; fall back to go2rtc.
      }
    };

    if (source.role === 'snapshot' || source.useForSnapshot) {
      const snapshot = await fetchSnapshotFromSource(source);
      if (snapshot && snapshot.byteLength > 0) {
        return snapshot;
      }

      const fallback = [this.lowResolutionSource, this.midResolutionSource, this.highResolutionSource].find((s) => s && s._id !== source._id);
      return fallback ? fetchSnapshotFromSource(fallback) : snapshot;
    } else {
      const pluginSnapshot = await fetchSnapshotFromPlugin(source);
      if (pluginSnapshot) {
        return pluginSnapshot;
      } else {
        const snapshot = await fetchSnapshotFromSource(source);
        return snapshot;
      }
    }
  }

  @RPCMethod
  public async snapshotWithMeta(sourceId: string, forceNew?: boolean): Promise<SnapshotWithMeta | undefined> {
    const data = await this.snapshot(sourceId, forceNew);
    if (!data) return undefined;

    const cached = this.snapshotCache.get(sourceId);
    const ageMs = cached?.data === data ? Math.max(0, Date.now() - cached.fetchedAt) : 0;

    return { data, ageMs };
  }

  @RPCMethod
  public async streamUrl(sourceId: string): Promise<string | undefined> {
    return this.cameraDeviceProxy?.streamUrl?.(sourceId);
  }

  @RPCMethod
  public async registerSensor(sensor: SensorJSON, pluginId: string): Promise<boolean> {
    return this.sensorController.registerSensor(sensor, pluginId);
  }

  @RPCMethod
  public unregisterSensor(sensorId: string): void {
    this.sensorController.unregisterSensor(sensorId);
  }

  @RPCMethod
  public async probeStream(sourceId: string, probeConfig?: ProbeConfig, refresh = false): Promise<ProbeStream | undefined> {
    let streamInfo = this.streamInfos.get(sourceId);
    if (streamInfo && !refresh) {
      return Promise.resolve(streamInfo);
    }

    const cameraSource = this.sources.find((source) => source._id === sourceId);
    if (!cameraSource) {
      return;
    }

    try {
      const src = createSourceName(this.name, cameraSource?.name);
      const probe = await this.go2rtcApi.streamsRoute.probeStreamSource({ src }, probeConfig);

      const videoStreamInfo: VideoStreamInfo[] = generateVideoStreamInfo(probe.producers);
      const audioStreamInfo: AudioStreamInfo[] = generateAudioStreamInfo(probe.producers);
      const sdp = generateSdp(videoStreamInfo, audioStreamInfo);

      streamInfo = {
        sdp,
        video: videoStreamInfo,
        audio: audioStreamInfo,
      };

      this.streamInfos.set(sourceId, streamInfo);
    } catch (err) {
      this.logger.error('Error while probing stream source', err.message.split('\n')[0]);
    }

    return streamInfo;
  }

  @RPCMethod
  public async getStreamStatus(sourceId: string): Promise<string> {
    const source = this.sources.find((s) => s._id === sourceId);
    if (!source) return 'idle';
    try {
      const sourceName = createSourceName(this.name, source.name);
      const statuses = await this.go2rtcApi.streamsRoute.getStreamsStatus();
      return statuses[sourceName] ?? 'idle';
    } catch {
      return 'idle';
    }
  }

  @RPCMethod
  public async refreshStates(): Promise<RefreshedStates> {
    return {
      camera: this.camera,
      cameraState: this.connected,
      frameWorkerState: this.frameWorker.status === PLUGIN_STATUS.STARTED,
      sensorStates: this.sensorController.getSensorStates(),
    };
  }

  public getSensors(): SensorLike[] {
    return this.sensorController.getAllSensors();
  }

  public getSensor(sensorId: string): SensorLike | undefined {
    return this.sensorController.getSensor(sensorId, { activatedOnly: true });
  }

  public getSensorsByType(type: SensorType): SensorLike[] {
    return this.sensorController.getSensorsByType(type);
  }

  public async addSensor<T extends object>(sensor: Sensor<T>): Promise<void> {
    const sensorJSON = sensor.toJSON();
    this.sensorController.registerSensor(sensorJSON, sensor.pluginId ?? '');
  }

  public async removeSensor(sensorId: string): Promise<void> {
    this.sensorController.unregisterSensor(sensorId);
  }

  public updateCamera(updatedCamera: Camera): void {
    const oldAssignments = this.camera.assignments;
    super.updateCamera(updatedCamera);
    this.detectAndNotifyAssignmentChanges(oldAssignments, updatedCamera.assignments);
  }

  public updateFrameWorkerState(state: boolean): void {
    super.updateFrameWorkerState(state);
  }

  public updateSensorState(sensorId: string, type: SensorType, addedOrRemoved: 'added' | 'removed'): void {
    if (addedOrRemoved === 'added') {
      this.#sensorAddedSubject.next({ sensorId, sensorType: type });
    } else {
      this.#sensorRemovedSubject.next({ sensorId, sensorType: type });
    }
  }

  public async cleanup(): Promise<void> {
    this.stopAutoRefresh();
    this.detectionEventUnsub?.();
    await this.frameWorker.close();
    await this.sensorController.destroy();
    this.removeAllListeners();
    this.unsubscribe();
    await this.closeProxy?.();
  }

  public async stop(): Promise<void> {
    this.initialized.next(false);
    await this.cleanup();
    this.loggerService.removeCameraLogger(this.id);
    this.triggerProxyEvent('removed');
  }

  public storageProxy(pluginId: string): Promisify<DeviceStorage> {
    const namespaces = NamespaceManager.pluginCameraNamespaces(pluginId, this.id);
    return this.proxy.createProxy<DeviceStorage>(namespaces.cameraStorageRpc);
  }

  public sensorStorageProxy(pluginId: string, sensorId: string): Promisify<DeviceStorage> {
    const namespaces = NamespaceManager.pluginSensorNamespaces(pluginId, this.id, sensorId);
    return this.proxy.createProxy<DeviceStorage>(namespaces.sensorStorageRpc);
  }

  private detectAndNotifyAssignmentChanges(oldAssignments: PluginAssignments, newAssignments: PluginAssignments): void {
    const multiProviderSet = new Set(getMultiProviderTypes());

    for (const [sensorTypeStr, config] of Object.entries(SENSOR_TYPE_CONFIG)) {
      const sensorType = sensorTypeStr as SensorType;
      const key = config.assignmentKey as keyof PluginAssignments;

      if (multiProviderSet.has(sensorType)) {
        const oldPlugins = (oldAssignments[key] as { id: string }[] | undefined) ?? [];
        const newPlugins = (newAssignments[key] as { id: string }[] | undefined) ?? [];

        const oldIds = new Set(oldPlugins.map((p) => p.id));
        const newIds = new Set(newPlugins.map((p) => p.id));

        for (const oldId of oldIds) {
          if (!newIds.has(oldId)) {
            this.sensorController.onAssignmentChanged(oldId, sensorType, false);
          }
        }

        for (const newId of newIds) {
          if (!oldIds.has(newId)) {
            this.sensorController.onAssignmentChanged(newId, sensorType, true);
          }
        }
      } else {
        const oldPlugin = oldAssignments[key] as { id: string } | undefined;
        const newPlugin = newAssignments[key] as { id: string } | undefined;

        const oldId = oldPlugin?.id;
        const newId = newPlugin?.id;

        if (oldId !== newId) {
          if (oldId) {
            this.sensorController.onAssignmentChanged(oldId, sensorType, false);
          }
          if (newId) {
            this.sensorController.onAssignmentChanged(newId, sensorType, true);
          }
        }
      }
    }
  }

  private async onDisabled(): Promise<void> {
    this.logger.log('Camera disabled — stopping FrameWorker, preloads, and auto-refresh');
    this.stopAutoRefresh();
    await this.frameWorker.close();
    await this.stopAllPreloads();
  }

  private async onSnoozed(): Promise<void> {
    this.logger.log('Camera snoozed — stopping FrameWorker (detections paused)');
    await this.frameWorker.close();
  }

  private async onUnsnoozed(): Promise<void> {
    this.logger.log('Camera unsnoozed — resuming detections');
    if (this.connected && !this.disabled) {
      this.frameWorker.start();
    }
  }

  private async onEnabled(): Promise<void> {
    this.logger.log('Camera enabled — resuming preloads, auto-refresh, and stream startup');

    if (!this.pluginInfo) {
      await this.initialPreload();
      if (!this.connected) {
        this.cameraState.next(true);
      }
    }

    this.startAutoRefresh();
    this.preloadSources();

    // onConnected fires on state change, not on current state — start FrameWorker
    // explicitly when the camera is already connected.
    if (this.connected) {
      this.frameWorker.start();
    }
  }

  private async initialPreload(): Promise<void> {
    for (const source of this.sources) {
      if (!source.hotMode) continue;
      try {
        const sourceName = createSourceName(this.name, source.name);
        await this.go2rtcApi.streamsRoute.addPreloadStream({ src: sourceName }, { video: true, audio: !source.muted, microphone: true });
      } catch {
        // Non-fatal: go2rtc might not be ready yet, 30s loop will retry
      }
    }
  }

  private async preloadSources(): Promise<void> {
    while (this.initialized.value) {
      if (this.disabled) {
        await this.stopAllPreloads();
        return;
      }

      await this.reconcilePreloads();

      await sleep(30000);
    }
  }

  private async reconcilePreloads(): Promise<void> {
    if (!this.connected || this.disabled) return;

    for (const source of this.sources) {
      try {
        const src = createSourceName(this.name, source.name);
        const preloadInfo = await this.go2rtcApi.streamsRoute.getPreloadStream({ src });
        if (source.hotMode && preloadInfo.status === 'stopped') {
          this.logger.debug(`Preloading source "${source.name}" for camera "${this.name}"`);
          await this.go2rtcApi.streamsRoute.addPreloadStream({ src }, { video: true, audio: !source.muted, microphone: true });
        } else if (!source.hotMode && preloadInfo.status === 'started') {
          this.logger.debug(`Stopping preload for source "${source.name}" for camera "${this.name}"`);
          await this.go2rtcApi.streamsRoute.deletePreloadStream({ src });
        }
      } catch {
        //
      }
    }
  }

  private async stopAllPreloads(): Promise<void> {
    for (const source of this.sources) {
      try {
        const src = createSourceName(this.name, source.name);
        const preloadInfo = await this.go2rtcApi.streamsRoute.getPreloadStream({ src });
        if (preloadInfo.status === 'started') {
          this.logger.debug(`Stopping preload for source "${source.name}" (camera disabled)`);
          await this.go2rtcApi.streamsRoute.deletePreloadStream({ src });
        }
      } catch {
        //
      }
    }
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();

    const settings = this.snapshotSettings;
    if (!settings.autoRefresh) return;

    const interval = Math.max(10, Math.min(60, settings.interval)) * 1000;

    this.logger.debug(`Starting snapshot auto-refresh with interval ${settings.interval}s`);

    this.autoRefreshInterval = setInterval(async () => {
      if (this.disabled || !this.connected) return;

      const source = this.getSnapshotSourceForAutoRefresh();
      if (!source) return;

      try {
        const snapshot = await this.snapshot(source._id, true);
        if (snapshot && snapshot.byteLength > 0) {
          this.triggerProxyEvent('snapshot:updated', { sourceId: source._id, snapshot });
        }
      } catch (error: any) {
        this.logger.debug('Auto-refresh snapshot failed:', error.message);
      }
    }, interval);
  }

  private getSnapshotSourceForAutoRefresh(): CameraDeviceSource | undefined {
    const snapshotSource = this.sources.find((s) => s.role === 'snapshot');
    if (snapshotSource) return snapshotSource;

    const useForSnapshot = this.sources.find((s) => s.useForSnapshot);
    if (useForSnapshot) return useForSnapshot;

    // Fallback priority: low → mid → high → stream.
    return this.lowResolutionSource ?? this.midResolutionSource ?? this.highResolutionSource ?? this.streamSource;
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
    }
  }

  private subscribeToCameraState(): Disposable {
    return this.cameraState
      .pipe(
        pairwise(),
        filter(([oldState, newState]) => oldState !== newState),
      )
      .subscribe(([, newState]) => {
        this.logger.log(`Camera ${newState ? 'connected' : 'disconnected'}`);
        this.triggerProxyEvent('cameraState', newState);

        try {
          const bus = container.resolve<InternalEventBus>('internalBus');
          bus.emitEvent(newState ? 'camera:connected' : 'camera:disconnected', { cameraId: this.id, cameraName: this.name });
        } catch {
          // ignore
        }
      });
  }

  private subscribeToFrameWorkerState(): Disposable {
    return this.frameWorkerState
      .pipe(
        pairwise(),
        filter(([oldState, newState]) => oldState !== newState),
      )
      .subscribe(([oldState, newState]) => {
        this.logger.log(`FrameWorker ${newState ? 'started' : 'stopped'}`);
        this.triggerProxyEvent('frameWorkerState', newState);

        try {
          const bus = container.resolve<InternalEventBus>('internalBus');
          bus.emitEvent(newState ? 'camera:frameworker:started' : 'camera:frameworker:stopped', { cameraId: this.id, cameraName: this.name });
        } catch {
          // ignore
        }

        // SensorController handles detection plugin reconciliation (false→true)
        // and cascade state reset (true→false).
        this.sensorController.onFrameWorkerStateChanged(oldState, newState);
      });
  }

  private subscribeToCameraChanges(): Disposable {
    return this.cameraSubject
      .pipe(
        pairwise(),
        filter(([oldCamera, newCamera]) => !isEqual(oldCamera, newCamera, true)),
      )
      .subscribe(([oldCamera, newCamera]) => {
        this.triggerProxyEvent('updated', newCamera);

        try {
          const bus = container.resolve<InternalEventBus>('internalBus');

          const watchedProps = [
            'name',
            'sources',
            'detectionSettings',
            'ptzAutotrack',
            'recordingSettings',
            'detectionZones',
            'detectionLines',
            'frameWorkerSettings',
            'interfaceSettings',
          ] as const;

          for (const prop of watchedProps) {
            if (!isEqual((oldCamera as any)[prop], (newCamera as any)[prop], true)) {
              bus.emitEvent('camera:property:changed', { cameraId: this.id, cameraName: this.name, property: prop });
            }
          }
        } catch {
          // ignore
        }

        if (oldCamera.name !== newCamera.name) {
          (this.logger as Logger).prefix = newCamera.name;
        }

        if (oldCamera.disabled !== newCamera.disabled) {
          if (newCamera.disabled) {
            this.onDisabled();
          } else {
            this.onEnabled();
          }
        }

        if (!newCamera.disabled && oldCamera.disabled === newCamera.disabled && !isEqual(oldCamera.sources, newCamera.sources, true)) {
          this.reconcilePreloads();
        }

        // Snooze only affects FrameWorker/detections.
        if (oldCamera.detectionSettings?.snooze !== newCamera.detectionSettings?.snooze) {
          if (newCamera.detectionSettings?.snooze) {
            this.onSnoozed();
          } else {
            this.onUnsnoozed();
          }
        }

        if (!newCamera.disabled) {
          const oldSettings = oldCamera.snapshotSettings;
          const newSettings = newCamera.snapshotSettings;
          if (oldSettings.autoRefresh !== newSettings.autoRefresh || oldSettings.interval !== newSettings.interval) {
            if (newSettings.autoRefresh) {
              this.startAutoRefresh();
            } else {
              this.stopAutoRefresh();
            }
          }
        }
      });
  }

  private triggerProxyEvent(stateName: 'removed'): void;
  private triggerProxyEvent(stateName: 'updated', data: Camera): void;
  private triggerProxyEvent(stateName: 'cameraState' | 'frameWorkerState', data: boolean): void;
  private triggerProxyEvent(stateName: 'snapshot:updated', data: SnapshotUpdatedEvent): void;
  private triggerProxyEvent(stateName: CameraDeviceListenerMessagePayload['type'], data?: Camera | boolean | SnapshotUpdatedEvent): void {
    this.proxy.publish(this.namespaces.cameraSubject, { type: stateName, data });
  }
}
