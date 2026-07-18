import { SensorType } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { SENSOR_TYPE_CONFIG } from '../camera/sensors/types.js';
import { ConfigService } from '../services/config/index.js';
import { buildCameraDiscovery, buildSensorDiscovery } from './ha-discovery.js';

import type { DetectionEvent, DetectionEventType } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../api.js';
import type { CameraController } from '../camera/controller.js';
import type {
  CameraEventPayload,
  InternalEvent,
  InternalEventBus,
  InternalEventPayload,
  PluginEventPayload,
  SensorLifecyclePayload,
  SensorPropertyChangedPayload,
  SystemNotificationPayload,
} from '../internal-bus.js';
import type { PluginManager } from '../plugins/index.js';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { MqttManager } from './manager.js';

interface ActiveDetectionState {
  motion: boolean;
  labels: Set<string>;
}

export class MqttBridge {
  private busHandlers: [InternalEvent, (payload: InternalEventPayload) => void][] = [];
  private cameraSubscriptions = new Map<string, () => void>();
  private retainedTopics = new Map<string, Set<string>>();
  private activeDetections = new Map<string, ActiveDetectionState>();
  private attached = false;

  constructor(private manager: MqttManager) {}

  public attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.onBus('system:started', () => {
      this.publishServerState();
      this.publishServerEvent('started');
    });

    this.onBus('system:shutdown', () => {
      this.publishServerEvent('shutdown');
      this.manager.publish(this.manager.topics.availability, 'offline', { retain: true, qos: 1 });
    });

    this.onBus('system:notification', (payload) => {
      const notification = payload as SystemNotificationPayload;
      this.manager.publish(this.manager.topics.serverNotification, JSON.stringify({ ...notification, timestamp: Date.now() }));
    });

    for (const event of ['plugin:started', 'plugin:stopped', 'plugin:error', 'plugin:crashed'] as const) {
      this.onBus(event, (payload) => {
        const plugin = payload as PluginEventPayload;
        this.manager.publish(this.manager.topics.pluginStatus(plugin.pluginName), plugin.status, { retain: true });
      });
    }

    this.onBus('camera:added', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      const controller = this.api.getCamera(cameraId);
      if (!controller) return;
      this.subscribeCamera(controller);
      this.publishCameraState(controller);
    });

    this.onBus('camera:removed', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      this.cameraSubscriptions.get(cameraId)?.();
      this.cameraSubscriptions.delete(cameraId);
      this.activeDetections.delete(cameraId);
      this.clearRetained(cameraId);
    });

    this.onBus('camera:connected', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      this.publishRetained(cameraId, this.manager.topics.cameraStatus(cameraId), 'online');
    });

    this.onBus('camera:disconnected', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      this.publishRetained(cameraId, this.manager.topics.cameraStatus(cameraId), 'offline');
    });

    this.onBus('camera:frameworker:started', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      this.publishRetained(cameraId, this.manager.topics.cameraFrameWorker(cameraId), 'online');
    });

    this.onBus('camera:frameworker:stopped', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      this.publishRetained(cameraId, this.manager.topics.cameraFrameWorker(cameraId), 'offline');
    });

    this.onBus('camera:property:changed', (payload) => {
      const { cameraId, property } = payload as CameraEventPayload;
      const controller = this.api.getCamera(cameraId);
      if (!controller) return;
      // A rename changes the HA device block in every discovery config.
      if (property === 'name' && this.manager.haDiscovery.enabled) {
        this.publishCameraState(controller);
      } else {
        this.publishCameraMeta(controller);
      }
    });

    this.onBus('sensor:added', (payload) => this.republishSensor(payload as SensorLifecyclePayload));

    this.onBus('sensor:removed', (payload) => {
      const sensor = payload as SensorLifecyclePayload;
      const sensorPrefix = `${this.manager.topics.sensorPrefix(sensor.cameraId, sensor.sensorStableId)}/`;
      const discoveryMarker = `/cameraui_${sensor.cameraId}/${sensor.sensorStableId}/`;
      this.clearRetained(sensor.cameraId, (topic) => topic.startsWith(sensorPrefix) || topic.includes(discoveryMarker));
    });

    // a rename or capability flip changes the discovery config (name, brightness
    // channel), so republish the whole sensor rather than a single property
    this.onBus('sensor:displayName:changed', (payload) => this.republishSensor(payload as SensorLifecyclePayload));

    this.onBus('sensor:capabilities:changed', (payload) => this.republishSensor(payload as SensorLifecyclePayload));

    this.onBus('sensor:property:changed', (payload) => {
      const change = payload as SensorPropertyChangedPayload;
      this.publishRetained(
        change.cameraId,
        this.manager.topics.sensorProperty(change.cameraId, change.sensorStableId, change.property),
        JSON.stringify(change.value ?? null),
      );
    });

    for (const controller of this.api.getCameras()) {
      this.subscribeCamera(controller);
    }
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;

    for (const [event, handler] of this.busHandlers) {
      this.bus.offEvent(event, handler);
    }
    this.busHandlers = [];

    for (const dispose of this.cameraSubscriptions.values()) {
      dispose();
    }
    this.cameraSubscriptions.clear();
    this.activeDetections.clear();
    this.retainedTopics.clear();
  }

  public handleCommand(topic: string, payload: Buffer): void {
    const commandRoot = `${this.manager.topics.prefix}/camera/`;
    if (!topic.startsWith(commandRoot) || !topic.endsWith('/set')) return;

    const parts = topic.slice(commandRoot.length).split('/');
    if (parts.length !== 5 || parts[1] !== 'sensor') return;
    const [cameraId, , stableId, property] = parts;

    const controller = this.api.getCamera(cameraId);
    if (!controller) return;

    const sensor = controller.sensorController.getAllSensors().find((s) => s.data.stableId === stableId);
    if (!sensor || SENSOR_TYPE_CONFIG[sensor.type]?.isDetectionType) return;

    sensor.updateValue(property, parseCommandPayload(payload.toString('utf8')));
  }

  public clearDiscovery(haPrefix: string): void {
    const prefix = `${haPrefix}/`;
    for (const [cameraId, topics] of this.retainedTopics) {
      for (const topic of topics) {
        if (!topic.startsWith(prefix)) continue;
        this.manager.publish(topic, '', { retain: true });
        topics.delete(topic);
      }
      if (topics.size === 0) this.retainedTopics.delete(cameraId);
    }
  }

  public publishFullState(): void {
    this.publishServerState();

    for (const [pluginName, plugin] of this.pluginManager.plugins) {
      this.manager.publish(this.manager.topics.pluginStatus(pluginName), plugin.worker.status, { retain: true });
    }

    for (const controller of this.api.getCameras()) {
      this.subscribeCamera(controller);
      this.publishCameraState(controller);
    }
  }

  private get bus(): InternalEventBus {
    return container.resolve<InternalEventBus>('internalBus');
  }

  private get api(): CameraUiAPI {
    return container.resolve<CameraUiAPI>('api');
  }

  private get pluginManager(): PluginManager {
    return container.resolve<PluginManager>('pluginManager');
  }

  private onBus(event: InternalEvent, handler: (payload: InternalEventPayload) => void): void {
    this.bus.onEvent(event, handler);
    this.busHandlers.push([event, handler]);
  }

  private subscribeCamera(controller: CameraController): void {
    if (this.cameraSubscriptions.has(controller.id)) return;

    const subscription = controller.onDetectionEvent.subscribe(({ type, event }) => {
      this.handleDetectionEvent(controller.id, type, event);
    });
    this.cameraSubscriptions.set(controller.id, () => subscription.dispose());
  }

  private publishServerState(): void {
    this.manager.publish(this.manager.topics.serverState, JSON.stringify({ version: ConfigService.VERSION, timestamp: Date.now() }), { retain: true });
  }

  private publishServerEvent(type: 'started' | 'shutdown'): void {
    this.manager.publish(this.manager.topics.serverEvent, JSON.stringify({ type, timestamp: Date.now() }));
  }

  private publishCameraState(controller: CameraController): void {
    const cameraId = controller.id;

    this.publishRetained(cameraId, this.manager.topics.cameraStatus(cameraId), controller.connected ? 'online' : 'offline');
    this.publishRetained(cameraId, this.manager.topics.cameraFrameWorker(cameraId), controller.frameWorkerConnected ? 'online' : 'offline');
    this.publishCameraMeta(controller);

    const ha = this.manager.haDiscovery;
    if (ha.enabled) {
      const hasObjectDetection = !!controller.sensorController.getSensorByTypeInternal(SensorType.Object);
      for (const message of buildCameraDiscovery(this.manager.topics, ha.prefix, controller.camera, hasObjectDetection)) {
        this.publishRetained(cameraId, message.topic, message.payload);
      }
    }

    for (const sensor of controller.sensorController.getAllSensors()) {
      this.publishSensorState(controller, sensor.data);
    }
  }

  private publishCameraMeta(controller: CameraController): void {
    const camera = controller.camera;
    const meta = {
      id: camera._id,
      name: camera.name,
      room: camera.room,
      type: camera.type,
      disabled: camera.disabled,
      info: camera.info,
    };
    this.publishRetained(controller.id, this.manager.topics.cameraMeta(controller.id), JSON.stringify(meta));
  }

  private republishSensor(sensor: Pick<SensorLifecyclePayload, 'cameraId' | 'sensorId'>): void {
    const controller = this.api.getCamera(sensor.cameraId);
    const data = controller?.sensorController.getSensor(sensor.sensorId)?.data;
    if (controller && data) this.publishSensorState(controller, data);
  }

  private publishSensorState(controller: CameraController, data: StoredSensorData): void {
    const cameraId = controller.id;
    const meta = {
      stableId: data.stableId,
      type: data.type,
      name: data.name,
      displayName: data.displayName,
      pluginId: data.pluginId,
    };
    this.publishRetained(cameraId, this.manager.topics.sensorMeta(cameraId, data.stableId), JSON.stringify(meta));

    for (const [property, value] of Object.entries(data.properties)) {
      this.publishRetained(cameraId, this.manager.topics.sensorProperty(cameraId, data.stableId, property), JSON.stringify(value ?? null));
    }

    const ha = this.manager.haDiscovery;
    if (ha.enabled) {
      for (const message of buildSensorDiscovery(this.manager.topics, ha.prefix, controller.camera, data)) {
        this.publishRetained(cameraId, message.topic, message.payload);
      }
    }
  }

  private handleDetectionEvent(cameraId: string, type: DetectionEventType, event: DetectionEvent): void {
    const topics = this.manager.topics;

    this.manager.publish(topics.cameraEvent(cameraId), JSON.stringify({ type, event: sanitizeDetectionEvent(event) }));

    const thumbnail = toBuffer(event.thumbnail);
    if (thumbnail) {
      this.publishRetained(cameraId, topics.cameraSnapshot(cameraId), thumbnail);
    }

    const state = this.activeDetections.get(cameraId) ?? { motion: false, labels: new Set<string>() };

    if (type === 'end') {
      if (state.motion) this.publishRetained(cameraId, topics.cameraMotion(cameraId), 'OFF');
      for (const label of state.labels) {
        this.publishRetained(cameraId, topics.cameraDetection(cameraId, label), 'OFF');
      }
      this.activeDetections.delete(cameraId);
      return;
    }

    this.activeDetections.set(cameraId, state);

    if (!state.motion && event.types?.includes('motion')) {
      state.motion = true;
      this.publishRetained(cameraId, topics.cameraMotion(cameraId), 'ON');
    }

    for (const label of collectDetectionLabels(event)) {
      if (state.labels.has(label)) continue;
      state.labels.add(label);
      this.publishRetained(cameraId, topics.cameraDetection(cameraId, label), 'ON');
    }
  }

  private publishRetained(cameraId: string, topic: string, payload: string | Buffer): void {
    let topics = this.retainedTopics.get(cameraId);
    if (!topics) {
      topics = new Set();
      this.retainedTopics.set(cameraId, topics);
    }
    topics.add(topic);

    this.manager.publish(topic, payload, { retain: true });
  }

  // Deleting a retained topic = publishing an empty retained payload.
  private clearRetained(cameraId: string, match?: (topic: string) => boolean): void {
    const topics = this.retainedTopics.get(cameraId);
    if (!topics) return;

    for (const topic of topics) {
      if (match && !match(topic)) continue;
      this.manager.publish(topic, '', { retain: true });
      topics.delete(topic);
    }

    if (topics.size === 0) {
      this.retainedTopics.delete(cameraId);
    }
  }
}

function sanitizeDetectionEvent(event: DetectionEvent): Record<string, unknown> {
  const { thumbnail: _thumbnail, segments, ...rest } = event;

  return {
    ...rest,
    segments: (segments ?? []).map((segment) => {
      const { thumbnail: _segmentThumbnail, detections, attributes, ...segmentRest } = segment;
      return {
        ...segmentRest,
        detections: (detections ?? []).map(({ thumbnail: _detectionThumbnail, ...detection }) => detection),
        attributes: (attributes ?? []).map(({ thumbnail: _attributeThumbnail, embedding: _embedding, clipEmbedding: _clipEmbedding, ...attribute }) => attribute),
      };
    }),
  };
}

function collectDetectionLabels(event: DetectionEvent): Set<string> {
  const labels = new Set<string>();
  for (const segment of event.segments ?? []) {
    for (const detection of segment.detections ?? []) {
      if (detection.label) labels.add(String(detection.label));
    }
  }
  return labels;
}

function toBuffer(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return undefined;
}

function parseCommandPayload(raw: string): unknown {
  const text = raw.trim();
  if (text === 'ON') return true;
  if (text === 'OFF') return false;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
