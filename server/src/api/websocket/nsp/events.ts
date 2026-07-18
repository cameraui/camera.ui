import { container } from 'tsyringe';

import type { DetectionEvent, DetectionEventType } from '@camera.ui/sdk';
import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { CameraController } from '../../../camera/controller.js';
import type {
  InternalEvent,
  InternalEventBus,
  InternalEventPayload,
  SensorCapabilitiesChangedPayload,
  SensorDisplayNameChangedPayload,
  SensorLifecyclePayload,
  SensorPropertyChangedPayload,
} from '../../../internal-bus.js';
import type { SocketNsp } from '../types.js';

interface CameraEventPayload {
  cameraId: string;
}

interface DetectionAttributePayload {
  type: string;
  label: string;
  confidence?: number;
}

interface DetectionEventMessage {
  type: DetectionEventType;
  event: Pick<DetectionEvent, 'id' | 'cameraId' | 'state' | 'startTime' | 'endTime' | 'lastUpdate' | 'expectedEndTime' | 'types' | 'triggers'>;
  labels?: string[];
  attributes?: DetectionAttributePayload[];
}

interface SensorMessage {
  type: 'added' | 'removed' | 'changed' | 'meta';
  cameraId: string;
  sensorId: string;
  stableId: string;
  globalId: string;
  sensorType: string;
  property?: string;
  value?: unknown;
  sensorName?: string;
  displayName?: string;
  capabilities?: string[];
}

const FORWARDED_TYPES: ReadonlySet<DetectionEventType> = new Set(['start', 'update', 'end', 'segment-start', 'segment-end']);

export function extractDetectionData(event: DetectionEvent): { labels: string[]; attributes: DetectionAttributePayload[] } {
  const labels: string[] = [];
  const attributes: DetectionAttributePayload[] = [];
  for (const segment of event.segments) {
    for (const detection of segment.detections) {
      if (!labels.includes(detection.label)) labels.push(detection.label);
    }
    for (const attribute of segment.attributes) {
      attributes.push({ type: attribute.type, label: attribute.label, confidence: attribute.confidence });
    }
  }
  return { labels, attributes };
}

export class EventsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/events';

  private api: CameraUiAPI;
  private cameraSubscriptions = new Map<string, () => void>();

  constructor(io: Server) {
    this.api = container.resolve<CameraUiAPI>('api');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('subscribe', (payload: { cameraIds?: string[] | 'all' }, callback?: Function) => {
        this.handleSubscribe(socket, payload, callback);
      });

      socket.on('unsubscribe', () => {
        for (const room of socket.rooms) {
          if (room.startsWith('camera:') || room === 'all') {
            socket.leave(room);
          }
        }
      });
    });

    for (const controller of this.api.getCameras()) {
      this.subscribeCamera(controller);
    }

    const bus = container.resolve<InternalEventBus>('internalBus');
    this.onBus(bus, 'camera:added', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      const controller = this.api.getCamera(cameraId);
      if (controller) this.subscribeCamera(controller);
    });

    this.onBus(bus, 'camera:removed', (payload) => {
      const { cameraId } = payload as CameraEventPayload;
      this.cameraSubscriptions.get(cameraId)?.();
      this.cameraSubscriptions.delete(cameraId);
    });

    this.onBus(bus, 'sensor:property:changed', (payload) => {
      const p = payload as SensorPropertyChangedPayload;
      this.emitSensor({
        type: 'changed',
        cameraId: p.cameraId,
        sensorId: p.sensorId,
        stableId: p.sensorStableId,
        globalId: p.sensorGlobalId,
        sensorType: p.sensorType,
        property: p.property,
        value: p.value,
      });
    });

    this.onBus(bus, 'sensor:added', (payload) => {
      const p = payload as SensorLifecyclePayload;
      this.emitSensor({
        type: 'added',
        cameraId: p.cameraId,
        sensorId: p.sensorId,
        stableId: p.sensorStableId,
        globalId: p.sensorGlobalId,
        sensorType: p.sensorType,
        sensorName: p.sensorName,
      });
    });

    this.onBus(bus, 'sensor:removed', (payload) => {
      const p = payload as SensorLifecyclePayload;
      this.emitSensor({ type: 'removed', cameraId: p.cameraId, sensorId: p.sensorId, stableId: p.sensorStableId, globalId: p.sensorGlobalId, sensorType: p.sensorType });
    });

    this.onBus(bus, 'sensor:displayName:changed', (payload) => {
      const p = payload as SensorDisplayNameChangedPayload;
      this.emitSensor({
        type: 'meta',
        cameraId: p.cameraId,
        sensorId: p.sensorId,
        stableId: p.sensorStableId,
        globalId: p.sensorGlobalId,
        sensorType: p.sensorType,
        displayName: p.displayName,
      });
    });

    this.onBus(bus, 'sensor:capabilities:changed', (payload) => {
      const p = payload as SensorCapabilitiesChangedPayload;
      this.emitSensor({
        type: 'meta',
        cameraId: p.cameraId,
        sensorId: p.sensorId,
        stableId: p.sensorStableId,
        globalId: p.sensorGlobalId,
        sensorType: p.sensorType,
        capabilities: p.capabilities,
      });
    });
  }

  private emitSensor(message: SensorMessage): void {
    this.nsp.to('all').to(`camera:${message.cameraId}`).emit('sensor', message);
  }

  private onBus(bus: InternalEventBus, event: InternalEvent, handler: (payload: InternalEventPayload) => void): void {
    bus.onEvent(event, handler);
  }

  private handleSubscribe(socket: Socket, payload: { cameraIds?: string[] | 'all' }, callback?: Function): void {
    const cameraIds = payload?.cameraIds ?? 'all';

    if (cameraIds === 'all') {
      socket.join('all');
      callback?.({ subscribed: 'all' });
      return;
    }

    const known = cameraIds.filter((id) => this.api.getCamera(id));
    for (const id of known) {
      socket.join(`camera:${id}`);
    }
    callback?.({ subscribed: known });
  }

  private subscribeCamera(controller: CameraController): void {
    if (this.cameraSubscriptions.has(controller.id)) return;

    const subscription = controller.onDetectionEvent.subscribe(({ type, event }) => {
      if (!FORWARDED_TYPES.has(type)) return;

      const message: DetectionEventMessage = {
        type,
        event: {
          id: event.id,
          cameraId: event.cameraId,
          state: event.state,
          startTime: event.startTime,
          endTime: event.endTime,
          lastUpdate: event.lastUpdate,
          expectedEndTime: event.expectedEndTime,
          types: event.types,
          triggers: event.triggers,
        },
      };

      const { labels, attributes } = extractDetectionData(event);
      if (labels.length) message.labels = labels;
      if (attributes.length) message.attributes = attributes;

      this.nsp.to('all').to(`camera:${controller.id}`).emit('detection', message);
    });

    this.cameraSubscriptions.set(controller.id, () => subscription.dispose());
  }
}
