import type { RPCClient } from '@camera.ui/rpc';
import type { BoundingBox, DetectionEvent, DetectionEventType, EventAttribute, EventDetection, EventSegment, LoggerService } from '@camera.ui/sdk';
import type { TraceTick } from './event-trace.js';

export interface RecordedDetection extends EventDetection {
  box?: BoundingBox;
  trackId?: number;
  firstSeen?: number;
  lastSeen?: number;
  firstMovingSeen?: number;
  lastMovingSeen?: number;
  presentSince?: number;
}

export interface RecordedAttribute extends EventAttribute {
  parentTrackId?: number;
  embedding?: number[];
  embeddingModel?: string;
  clipEmbedding?: number[];
  clipEmbeddingModel?: string;
}

export interface RecordedSegment extends Omit<EventSegment, 'detections' | 'attributes'> {
  thumbnailAt?: number;
  detections: RecordedDetection[];
  attributes: RecordedAttribute[];
}

export interface RecordedEvent extends Omit<DetectionEvent, 'segments'> {
  segments: RecordedSegment[];
  thumbnailAt?: number;
}

export interface EventAttachments {
  scene?: Uint8Array;
  strip?: Uint8Array;
  card?: Uint8Array;
  attributes?: (Uint8Array | undefined)[];
  trace?: TraceTick[];
}

export function leanEvent(event: RecordedEvent): DetectionEvent {
  const { thumbnailAt: _at, segments, ...rest } = event;

  return {
    ...rest,
    segments: segments.map(({ thumbnailAt: _segAt, detections, attributes, ...segment }) => ({
      ...segment,
      detections: detections.map(
        ({ box: _box, trackId: _trackId, zones: _zones, firstSeen: _f, lastSeen: _l, firstMovingSeen: _fm, lastMovingSeen: _lm, presentSince: _ps, ...detection }) =>
          detection,
      ),
      attributes: attributes
        .filter((attribute) => attribute.type !== 'clip')
        .map(({ parentTrackId: _parent, embedding: _e, embeddingModel: _em, clipEmbedding: _c, clipEmbeddingModel: _cm, ...attribute }) => attribute),
    })),
  };
}

interface NvrIngest {
  ingestDetectionEvent(cameraId: string, type: DetectionEventType, event: RecordedEvent, attachments?: EventAttachments): Promise<void>;
}

export class NvrSink {
  private rpc?: NvrIngest;

  constructor(
    private readonly proxy: RPCClient,
    private readonly logger: LoggerService,
  ) {}

  public get connected(): boolean {
    return this.rpc !== undefined;
  }

  public setNamespace(namespace: string | undefined): void {
    this.rpc = namespace ? this.proxy.createProxy<NvrIngest>(namespace) : undefined;
  }

  public send(type: DetectionEventType, event: RecordedEvent, attachments?: EventAttachments): void {
    if (!this.rpc) return;

    this.rpc.ingestDetectionEvent(event.cameraId, type, event, attachments).catch((error: unknown) => {
      this.logger.debug(`NVR plugin did not take the ${type} message:`, error);
    });
  }
}
