import { generateSdp } from '@camera.ui/common/camera';
import { isEqual, PromiseTimeout } from '@camera.ui/common/utils';
import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { API_EVENT, filter, pairwise, SensorType, Subject } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { PLUGIN_STATUS } from '../plugins/types.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { buildSnapshotUrl, buildTargetUrl, createSourceName } from '../utils/camera.js';
import { getSourceCodecInfo, setSourceCodecInfo } from './codecCache.js';
import { FrameWorker } from './decoder/worker.js';
import { CameraDevice } from './index.js';
import { SnapshotPrivacy } from './privacy/snapshot.js';
import { SensorController } from './sensors/controller.js';
import { SnapshotStore } from './snapshot-store.js';
import { Fmp4Session } from './streaming/fmp4-session.js';
import { RtpSession } from './streaming/rtp-session.js';
import { generateAudioStreamInfo, generateVideoStreamInfo, hasLiveCameraProducer } from './utils.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  Camera,
  CameraDeviceSource,
  CameraImplementation,
  CameraInput,
  DetectionEvent,
  DetectionEventType,
  DeviceStorage,
  Disposable,
  Observable,
  ProbeConfig,
  ProbeStream,
  RTSPUrlOptions,
  Sensor,
  SensorLike,
} from '@camera.ui/sdk';
import type { DetectionEventMessage } from '@camera.ui/sdk/internal';
import type { CameraUiAPI } from '../api.js';
import type { Go2RtcApi } from '../go2rtc/api/index.js';
import type { Go2RtcState, Go2RtcStreamState } from '../go2rtc/state.js';
import type { Go2RTCProducer } from '../go2rtc/types.js';
import type { InternalEventBus } from '../internal-bus.js';
import type { ProxyServer } from '../rpc/index.js';
import type { CameraDeviceInterface, CameraDeviceListenerMessagePayload, RefreshedStates, SnapshotUpdatedEvent, SnapshotWithMeta } from '../rpc/interfaces/device.js';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { CameraNamespaces, FrameWorkerDetectionNamespaces } from '../rpc/namespaces.js';
import type { SensorRegistry } from '../sensors/registry.js';
import type { LoggerService } from '../services/logger/index.js';
import type { SourceCodecInfo } from './codecCache.js';
import type { StoredSnapshot } from './snapshot-store.js';

const PRELOAD_KINDS: ProbeConfig = { video: true, audio: true, microphone: true };
// covers a battery camera waking up: bridge handshake plus the wait for its parameter sets
const COLD_PROBE_TIMEOUT_MS = 30_000;
const SOURCE_CODEC_KEYS: (keyof SourceCodecInfo)[] = ['videoCodec', 'audioCodecs', 'backchannelAudioCodec'];

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
  private go2rtcState: Go2RtcState;
  private loggerService: LoggerService;
  private api: CameraUiAPI;

  private closeProxy?: () => Promise<void>;
  private detectionEventUnsub?: () => void;
  private autoRefreshInterval?: NodeJS.Timeout;
  private snapshotPrivacy: SnapshotPrivacy;
  private readonly snapshots = new SnapshotStore((sourceId, entry) => this.announceSnapshot(sourceId, entry));
  private readonly preloadsInFlight = new Set<string>();

  constructor(camera: Camera, logger: Logger) {
    super(camera, logger);

    this.snapshotPrivacy = new SnapshotPrivacy(logger);
    this.snapshotPrivacy.update(camera.zones);

    this.api = container.resolve<CameraUiAPI>('api');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
    this.go2rtcState = container.resolve<Go2RtcState>('go2rtcState');
    this.loggerService = container.resolve<LoggerService>('logger');
    this.proxy = container.resolve<ProxyServer>('proxy').proxy;

    this.frameWorker = new FrameWorker(this);
    this.sensorController = new SensorController(this, this.frameWorker, this.proxy);

    this.namespaces = {
      ...NamespaceManager.cameraNamespaces(camera._id),
      ...NamespaceManager.frameWorkerDetectionNamespaces(camera._id),
    };

    this.addSubscriptions(this.subscribeToCameraState(), this.subscribeToFrameWorkerState(), this.subscribeToCameraChanges());

    this.go2rtcState.on('stream', this.handleStreamState);
    this.go2rtcState.on('snapshot', this.handleStreamSnapshot);

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

  get preferredSnapshotSource(): CameraDeviceSource | undefined {
    const dedicated = this.sources.find((s) => s.role === 'snapshot') ?? this.sources.find((s) => s.useForSnapshot);
    return dedicated ?? this.lowResolutionSource ?? this.midResolutionSource ?? this.highResolutionSource ?? this.streamSource;
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
    this.reconcilePreloads();
  }

  public removePluginSensors(pluginId: string): void {
    this.sensorController.unassignPluginSensors(pluginId);
  }

  public getSensorByType(sensorType: SensorType): StoredSensorData | undefined {
    return this.sensorController.getSensorByTypeInternal(sensorType)?.data;
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
  public async snapshot(sourceId: string, forceNew?: boolean, preferNative?: boolean): Promise<ArrayBuffer | undefined> {
    if (!forceNew) {
      const stored = this.snapshots.serve(sourceId, this.snapshotSettings);
      if (stored) return stored;
    }

    const source = this.sources.find((source) => source._id === sourceId);
    if (!source) {
      throw new Error('Source not found');
    }

    const storeSnapshot = async (s: CameraDeviceSource, data: ArrayBuffer): Promise<ArrayBuffer | undefined> => {
      const masked = await this.snapshotPrivacy.apply(data);
      if (masked && masked.byteLength > 0) {
        this.snapshots.set(s._id, masked, Date.now(), s._id === this.preferredSnapshotSource?._id);
      }

      return masked;
    };

    const fetchSnapshotFromSource = async (s: CameraDeviceSource): Promise<ArrayBuffer | undefined> => {
      try {
        const sourceName = createSourceName(this.name, s.name);
        const snapshot = await this.go2rtcApi.snapshotRoute.jpeg({ src: sourceName, ...(forceNew ? { gop: 0 as const } : {}) });
        if (snapshot.byteLength === 0) {
          return snapshot;
        }

        return await storeSnapshot(s, snapshot);
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
          return await storeSnapshot(s, pluginSnapshot);
        }
      } catch {
        // Ignore plugin errors; fall back to go2rtc.
      }
    };

    const designatedSnapshotSource = source.role === 'snapshot' || source.useForSnapshot;

    if (preferNative || !designatedSnapshotSource) {
      const pluginSnapshot = await fetchSnapshotFromPlugin(source);
      if (pluginSnapshot) {
        return pluginSnapshot;
      }
    }

    const snapshot = await fetchSnapshotFromSource(source);
    if (snapshot && snapshot.byteLength > 0) {
      return snapshot;
    }

    if (designatedSnapshotSource) {
      const fallback = [this.lowResolutionSource, this.midResolutionSource, this.highResolutionSource].find((s) => s && s._id !== source._id);
      return fallback ? fetchSnapshotFromSource(fallback) : snapshot;
    }

    return snapshot;
  }

  @RPCMethod
  public async snapshotWithMeta(sourceId: string, forceNew?: boolean): Promise<SnapshotWithMeta | undefined> {
    const data = await this.snapshot(sourceId, forceNew);
    if (!data) return undefined;

    const stored = this.snapshots.get(sourceId);
    const ageMs = stored?.data === data ? Math.max(0, Date.now() - stored.fetchedAt) : 0;

    return { data, ageMs };
  }

  @RPCMethod
  public async streamUrl(sourceId: string): Promise<string | undefined> {
    return this.cameraDeviceProxy?.streamUrl?.(sourceId);
  }

  @RPCMethod
  public async probeStream(sourceId: string, _probeConfig?: ProbeConfig, refresh = false): Promise<ProbeStream | undefined> {
    const cameraSource = this.sources.find((source) => source._id === sourceId);
    if (!cameraSource) {
      return;
    }

    const src = createSourceName(this.name, cameraSource.name);

    if (!refresh) {
      const live = this.go2rtcState.get(src)?.producers;
      if (hasLiveCameraProducer(live)) {
        return this.rememberStreamInfo(sourceId, live);
      }

      const known = this.streamInfos.get(sourceId);
      if (known) {
        return known;
      }
    }

    try {
      const probe = await PromiseTimeout(this.go2rtcApi.streamsRoute.probeStreamSource({ src }, PRELOAD_KINDS), COLD_PROBE_TIMEOUT_MS);
      return this.rememberStreamInfo(sourceId, probe.producers);
    } catch (err) {
      this.logger.error('Error while probing stream source', err.message.split('\n')[0]);
      return this.streamInfos.get(sourceId);
    }
  }

  @RPCMethod
  public async getStreamStatus(sourceId: string): Promise<string> {
    const source = this.cameraObject.sources.find((s) => s._id === sourceId);
    if (!source) return 'idle';
    return this.go2rtcState.get(createSourceName(this.name, source.name))?.status ?? 'idle';
  }

  @RPCMethod
  public async refreshStates(): Promise<RefreshedStates> {
    return {
      camera: this.camera,
      cameraState: this.connected,
      frameWorkerState: this.frameWorker.status === PLUGIN_STATUS.STARTED,
      sensorStates: this.sensorController.getStatesForCamera(),
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
    const registry = container.resolve<SensorRegistry>('sensorRegistry');
    const sensorJSON = sensor.toJSON();
    sensorJSON.nativeId ??= `${this.id}:${sensor.type}:${sensor.name}`;
    registry.registerSensor(sensorJSON, sensor.pluginId ?? '', { assignCameraId: this.id });
  }

  public async removeSensor(sensorId: string): Promise<void> {
    const registry = container.resolve<SensorRegistry>('sensorRegistry');
    registry.unregisterSensor(sensorId);
  }

  public updateCamera(updatedCamera: Camera): void {
    super.updateCamera(updatedCamera);
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
    this.go2rtcState.off('stream', this.handleStreamState);
    this.go2rtcState.off('snapshot', this.handleStreamSnapshot);
    this.stopAutoRefresh();
    this.snapshots.dispose();
    this.detectionEventUnsub?.();
    this.snapshotPrivacy.dispose();
    await this.frameWorker.destroy();
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
    const namespaces = NamespaceManager.pluginSensorNamespaces(pluginId, sensorId);
    return this.proxy.createProxy<DeviceStorage>(namespaces.sensorStorageRpc);
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
    this.frameWorker.start();
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
    this.reconcilePreloads();

    this.frameWorker.start();
  }

  private async initialPreload(): Promise<void> {
    for (const source of this.sources) {
      if (!source.hotMode) continue;
      try {
        const sourceName = createSourceName(this.name, source.name);
        await this.go2rtcApi.streamsRoute.addPreloadStream({ src: sourceName }, PRELOAD_KINDS);
      } catch {
        // go2rtc might not be ready yet, ignore
      }
    }
  }

  private reconcilePreloads(): void {
    for (const source of this.cameraObject.sources) {
      this.reconcilePreload(source, this.go2rtcState.get(createSourceName(this.name, source.name)));
    }
  }

  private async reconcilePreload(source: CameraInput, state: Go2RtcStreamState | undefined): Promise<void> {
    if (!state || !this.connected || this.disabled) return;

    const src = createSourceName(this.name, source.name);
    const preloaded = state.preload !== null;
    if (Boolean(source.hotMode) === preloaded || this.preloadsInFlight.has(src)) return;

    this.preloadsInFlight.add(src);
    try {
      if (source.hotMode) {
        this.logger.debug(`Preloading source "${source.name}" for camera "${this.name}"`);
        await this.go2rtcApi.streamsRoute.addPreloadStream({ src }, PRELOAD_KINDS);
      } else {
        this.logger.debug(`Stopping preload for source "${source.name}" for camera "${this.name}"`);
        await this.go2rtcApi.streamsRoute.deletePreloadStream({ src });
      }
    } catch {
      // retried with the next state of this stream
    } finally {
      this.preloadsInFlight.delete(src);
    }
  }

  private applyStreamState(source: CameraInput, state: Go2RtcStreamState | undefined): void {
    if (hasLiveCameraProducer(state?.producers)) {
      this.rememberStreamInfo(source._id, state.producers);
    }
    this.reconcilePreload(source, state);
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
    if (settings.mode !== 'interval') return;

    const interval = Math.max(10, Math.min(3600, settings.interval)) * 1000;

    this.logger.debug(`Starting snapshot auto-refresh with interval ${settings.interval}s`);

    this.autoRefreshInterval = setInterval(async () => {
      if (this.disabled || !this.connected) return;

      const source = this.preferredSnapshotSource;
      if (!source) return;

      try {
        await this.snapshot(source._id, true);
      } catch (error: any) {
        this.logger.debug('Auto-refresh snapshot failed:', error.message);
      }
    }, interval);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
    }
  }

  private announceSnapshot(sourceId: string, entry: StoredSnapshot): void {
    this.triggerProxyEvent('snapshot:updated', { sourceId, snapshot: entry.data, fetchedAt: entry.fetchedAt });
    try {
      const bus = container.resolve<InternalEventBus>('internalBus');
      bus.emitEvent('camera:snapshot:updated', { cameraId: this.id, cameraName: this.name });
    } catch {
      // ignore
    }
  }

  private async remaskSnapshots(): Promise<void> {
    const preferred = this.preferredSnapshotSource?._id;
    for (const [sourceId, entry] of this.snapshots.list()) {
      const masked = await this.snapshotPrivacy.apply(entry.data);
      if (!masked || masked.byteLength === 0) {
        this.snapshots.delete(sourceId);
      } else if (masked !== entry.data) {
        this.snapshots.set(sourceId, masked, entry.fetchedAt, sourceId === preferred);
      }
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

        if (newState && !this.disabled) {
          this.reconcilePreloads();
        }

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

  private rememberStreamInfo(sourceId: string, producers: Go2RTCProducer[]): ProbeStream | undefined {
    const video = generateVideoStreamInfo(producers);
    const audio = generateAudioStreamInfo(producers);

    if (!video.length && !audio.length) {
      return this.streamInfos.get(sourceId);
    }

    const streamInfo: ProbeStream = { sdp: generateSdp(video, audio), video, audio };
    this.streamInfos.set(sourceId, streamInfo);
    this.applySourceCodec(sourceId, streamInfo);

    return streamInfo;
  }

  private applySourceCodec(sourceId: string, streamInfo: ProbeStream): void {
    const info: SourceCodecInfo = {
      videoCodec: streamInfo.video.find((v) => v.direction === 'sendonly')?.codec,
      audioCodecs: [...new Set(streamInfo.audio.filter((a) => a.direction === 'sendonly').map((a) => a.codec))],
      backchannelAudioCodec: streamInfo.audio.find((a) => a.direction === 'recvonly')?.codec,
    };
    if (!info.audioCodecs?.length) delete info.audioCodecs;
    if (!info.videoCodec && !info.audioCodecs && !info.backchannelAudioCodec) return;
    if (isEqual(getSourceCodecInfo(sourceId), info, true)) return;

    setSourceCodecInfo(sourceId, info);

    const camera = this.cameraObject;
    const source = camera.sources.find((s) => s._id === sourceId);
    if (!source) return;

    for (const key of SOURCE_CODEC_KEYS) {
      if (info[key] === undefined) {
        delete source[key];
      } else {
        Object.assign(source, { [key]: info[key] });
      }
    }
    this.updateCamera(camera);
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
            'notificationSettings',
            'zones',
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

        if (!isEqual(oldCamera.zones?.privacy, newCamera.zones?.privacy, true) || oldCamera.zones?.privacyFallback !== newCamera.zones?.privacyFallback) {
          this.snapshotPrivacy.update(newCamera.zones);
          this.remaskSnapshots();
        }

        if (!isEqual(oldCamera.sources, newCamera.sources, true)) {
          this.snapshots.retain(newCamera.sources.map((source) => source._id));
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
          if (oldSettings.mode !== newSettings.mode || oldSettings.interval !== newSettings.interval) {
            this.startAutoRefresh();
          }
        }
      });
  }

  private readonly handleStreamState = (name: string, state: Go2RtcStreamState | undefined): void => {
    const source = this.cameraObject.sources.find((s) => createSourceName(this.name, s.name) === name);
    if (source) {
      this.applyStreamState(source, state);
    }
  };

  private readonly handleStreamSnapshot = (): void => {
    for (const source of this.cameraObject.sources) {
      this.applyStreamState(source, this.go2rtcState.get(createSourceName(this.name, source.name)));
    }
  };

  private triggerProxyEvent(stateName: 'removed'): void;
  private triggerProxyEvent(stateName: 'updated', data: Camera): void;
  private triggerProxyEvent(stateName: 'cameraState' | 'frameWorkerState', data: boolean): void;
  private triggerProxyEvent(stateName: 'snapshot:updated', data: SnapshotUpdatedEvent): void;
  private triggerProxyEvent(stateName: CameraDeviceListenerMessagePayload['type'], data?: Camera | boolean | SnapshotUpdatedEvent): void {
    this.proxy.publish(this.namespaces.cameraSubject, { type: stateName, data });
  }
}
