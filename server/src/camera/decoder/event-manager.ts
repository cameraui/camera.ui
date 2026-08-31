import { randomUUID } from 'node:crypto';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { boxAnchorInPolygon, boxInsidePolygon, boxIntersectsPolygon } from '../utils/filter.js';
import { detectionRecord } from './debug/detection-record.js';
import { EventTraceCollector } from './event-trace.js';
import { leanEvent, NvrSink } from './nvr-sink.js';
import { MAX_UNTRACKED_PLATES, normalizePlateText, PlateVoteTracker } from './plate-vote.js';
import { isFullFrameBox } from './types.js';

import type { RPCClient } from '@camera.ui/rpc';
import type {
  AlertZoneMatch,
  BoundingBox,
  ClassifierDetection,
  ClipEmbedding,
  Detection,
  DetectionEventType,
  DetectionPath,
  EventTrigger,
  EventTriggerType,
  FaceDetection,
  LicensePlateDetection,
  LoggerService,
  Point,
} from '@camera.ui/sdk';
import type { DetectionEventMessage } from '@camera.ui/sdk/internal';
import type { DetectionThumbnail } from '../../rpc/interfaces/detection.js';
import type { LineCrossingEvent } from './detection-pipeline.js';
import type { TraceTick } from './event-trace.js';
import type { EventAttachments, RecordedAttribute, RecordedEvent, RecordedSegment } from './nvr-sink.js';
import type { AnalysisStream } from './types.js';

export interface TrackedSecondary {
  parentTrackId?: number;
  parentBox?: BoundingBox;
}

export interface TrackedFaceDetection extends FaceDetection, TrackedSecondary {}
export interface TrackedLicensePlateDetection extends LicensePlateDetection, TrackedSecondary {}
export interface TrackedClassifierDetection extends ClassifierDetection, TrackedSecondary {}
export interface TrackedClipEmbedding extends ClipEmbedding, TrackedSecondary {}

export interface NormalizedDetectionZone {
  name: string;
  points: Point[];
  match?: AlertZoneMatch;
  alertLabels?: string[];
}

export const MOMENT_RANK_OBJECT = 0;
export const MOMENT_RANK_ATTRIBUTE = 1;

export interface SegmentMoment {
  strip: Buffer;
  card?: Buffer;
  capturedAt: number;
  score: number;
  rank: number;
  stream: AnalysisStream;
}

export interface ProcessedDetectionData {
  hasCascadeTrigger: boolean;
  hasOpenSpans?: boolean;
  motion?: {
    detected: boolean;
  };
  audio?: {
    detected: boolean;
    detections: Detection[];
  };
  cascadeTriggered?: boolean;
  sensorTriggers?: string[];
  objects: Detection[];
  faces: TrackedFaceDetection[];
  faceEmbeddingModel?: string;
  plates: TrackedLicensePlateDetection[];
  plateVoting?: boolean;
  plateMinConfidence?: number;
  plateMinLength?: number;
  faceMinConfidence?: number;
  classifiers: TrackedClassifierDetection[];
  clips: TrackedClipEmbedding[];
  clipEmbeddingModel?: string;
  thumbnails?: DetectionThumbnail[];
  eventThumbnail?: Buffer;
  lineCrossings?: LineCrossingEvent[];
  timestamp: number;
  segmentTimeout: number;
  expectedEndTime: number;
  detectionZones?: NormalizedDetectionZone[];
  trace?: TraceTick;
}

const UPDATE_THROTTLE_MS = 1000;
const MOMENT_IMPROVEMENT = 1.25;
const CLIP_ATTRIBUTE = 'clip';
const MIN_MOVING_SPEED = 0.05;
const STATIONARY_SPEED_THRESHOLD = 0.002;

function zoneHit(box: BoundingBox, zone: NormalizedDetectionZone): boolean {
  if (zone.match === 'anchor') return boxAnchorInPolygon(box, zone.points);
  if (zone.match === 'contain') return boxInsidePolygon(box, zone.points);
  return boxIntersectsPolygon(box, zone.points);
}

function mayAlert(label: string, box: BoundingBox | undefined, hits: Set<string> | undefined, alertZones: NormalizedDetectionZone[]): boolean {
  if (alertZones.length === 0) return true;

  const lower = label.toLowerCase();
  const claiming = alertZones.filter((zone) => zone.alertLabels!.length === 0 || zone.alertLabels!.includes(lower));
  if (claiming.length === 0) return false;
  if (!box || isFullFrameBox(box)) return true;

  return claiming.some((zone) => hits?.has(zone.name));
}

function jpegInfo(jpeg: Buffer): string {
  let i = 2;
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = jpeg[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // SOF0-SOF15 carry the frame size, skip DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = jpeg.readUInt16BE(i + 5);
      const width = jpeg.readUInt16BE(i + 7);
      return `${width}x${height}/${Math.round(jpeg.length / 1024)}kb`;
    }
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  return `?x?/${Math.round(jpeg.length / 1024)}kb`;
}

interface HeldAttribute {
  thumbnail?: Uint8Array;
  embedding?: number[];
  embeddingModel?: string;
  clipEmbedding?: number[];
  clipEmbeddingModel?: string;
}

interface ThumbnailCandidate {
  jpeg: Buffer;
  score: number;
  area: number;
  onEdge: boolean;
  hasAttribute: boolean;
  trackId?: number;
  speed?: number;
}

export class DetectionEventManager {
  private static readonly MAX_PLATE_THUMBNAILS = 16;
  private static readonly SEGMENT_LINGER_MS = 10_000;

  private activeEvent: RecordedEvent | null = null;
  private activeSegment: RecordedSegment | null = null;
  private segmentTrackPaths = new Map<number, DetectionPath>();
  private segmentIndex = 0;
  private lastPublishTime = 0;

  private shippedSceneAt = 0;
  private attributeThumbnails = new Map<string, ThumbnailCandidate>();
  private identifiedFaceTracks = new Set<number>();
  private heldAttributes: HeldAttribute[] = [];
  private shippedAttributes = new Map<number, Uint8Array>();
  private segmentMoment?: SegmentMoment;
  private pendingMoment?: SegmentMoment;
  private eventThumbnailAt = 0;
  private segmentClosePendingSince: number | null = null;
  private lingerTimer: NodeJS.Timeout | null = null;

  private eventThumbnail: Buffer | null = null;
  private needsEventThumbnail = false;

  private segmentFaceTrackIds = new Map<string, number>();
  private segmentPlateAttrIndex = new Map<string, number>();
  private segmentPlateReads = new Set<string>();
  private eventPlateVotes = new Map<string, PlateVoteTracker>();
  private plateVotingActive = true;
  private segmentClassifierTrackIds = new Map<string, number>();
  private segmentClipLabels = new Map<string, number>();

  private readonly eventSubject: string;
  private readonly nvr: NvrSink;
  private readonly trace = new EventTraceCollector();

  private onEventEndCallback?: () => void;
  private onSegmentClosedCallback?: () => void;

  constructor(
    private readonly cameraId: string,
    private readonly proxy: RPCClient,
    private readonly logger: LoggerService,
  ) {
    const ns = NamespaceManager.detectionEventNamespaces(cameraId);
    this.eventSubject = ns.detectionEventSubject;
    this.nvr = new NvrSink(proxy, logger);
  }

  public updateNvrRpc(namespace?: string): void {
    this.nvr.setNamespace(namespace);
  }

  public onEventEnd(callback: () => void): void {
    this.onEventEndCallback = callback;
  }

  public onSegmentClosed(callback: () => void): void {
    this.onSegmentClosedCallback = callback;
  }

  public offerMoment(moment: SegmentMoment): void {
    // the tick cuts the moment before it opens the segment, so the very picture
    // that opens a span would be the one dropped; hold it for that opening
    if (!this.activeSegment) {
      // a tick can offer the object shot and then the face shot; within the tick
      // they compete by rank, a newer tick always displaces the older pending one
      if (this.beatsMoment(moment.rank, moment.score, moment.stream, this.incumbentMoment(moment.capturedAt))) {
        this.pendingMoment = moment;
      }
      // debugging
      this.recordMomentVerdict(moment, 'pending');
      return;
    }
    this.takeMoment(moment);
  }

  public wantsMoment(rank: number, score: number, stream: AnalysisStream, at: number): boolean {
    return this.beatsMoment(rank, score, stream, this.incumbentMoment(at));
  }

  public processResults(data: ProcessedDetectionData): void {
    const now = data.timestamp;
    const triggers = this.extractTriggers(data, now);
    const hasDetections = this.hasNewDetections(data);

    if (triggers.length === 0 && !this.activeEvent) return;

    if (!this.activeEvent) {
      if (triggers.length === 0) return;
      this.startEvent(triggers, data, now);
      if (data.trace) this.trace.add(data.trace);
      return;
    }

    if (data.trace) this.trace.add(data.trace);

    // publish immediately, the UI shouldn't wait for the next throttled update
    if (data.eventThumbnail && this.needsEventThumbnail) {
      this.eventThumbnail = data.eventThumbnail;
      this.eventThumbnailAt = now;
      this.needsEventThumbnail = false;
      this.publishEventThumbnail();
    }

    if (triggers.length > 0) {
      this.enrichTriggers(triggers, now);
      // a trigger joining mid-event (doorbell press during a motion event)
      // must stamp its type right away, not wait for the next segment update
      this.updateTypes();
      this.activeEvent.lastUpdate = now;
      this.activeEvent.expectedEndTime = data.expectedEndTime;
      // keep-alive for the UI; with an active segment, segment-update carries this
      if (!this.activeSegment) {
        this.publishUpdateThrottled();
      }
    }

    if (data.hasOpenSpans) {
      this.segmentClosePendingSince = null;
      if (this.lingerTimer) {
        clearTimeout(this.lingerTimer);
        this.lingerTimer = null;
      }
      if (!this.activeSegment) {
        if (hasDetections) this.openSegment(data, now);
      } else if (hasDetections) {
        this.enrichSegment(data, now);
        if (data.thumbnails && data.thumbnails.length > 0) {
          this.updateThumbnails(data.thumbnails);
        }
        this.activeEvent.lastUpdate = now;
        this.updateTypes();
        this.publishSegmentThrottled('segment-update');
      }
    } else if (this.activeSegment && this.segmentClosePendingSince === null) {
      // all spans closed: linger before deciding, a reopening span continues
      // this segment (detector flicker is not a new visit); lastSeen stays on
      // the last real detection, timer-driven so tickless cameras close too
      this.segmentClosePendingSince = now;
      this.lingerTimer = setTimeout(() => {
        this.lingerTimer = null;
        if (this.segmentClosePendingSince === null) return;
        this.segmentClosePendingSince = null;
        this.closeSegment();
        this.onSegmentClosedCallback?.();
      }, DetectionEventManager.SEGMENT_LINGER_MS);
    }
  }

  public hasActiveSegment(): boolean {
    return this.activeSegment !== null;
  }

  public forceEndActiveEvent(): void {
    if (this.activeEvent) this.endEvent();
  }

  public destroy(): void {
    if (this.activeEvent) this.endEvent();
  }

  public publishEventThumbnail(jpeg?: Buffer, capturedAt?: number): void {
    if (!this.activeEvent) return;
    if (jpeg) {
      this.eventThumbnail = jpeg;
      this.eventThumbnailAt = capturedAt ?? Date.now();
      this.needsEventThumbnail = false;
    }
    if (!this.eventThumbnail) return;
    this.logger.trace(`[event] thumbnail id=${this.activeEvent.id.slice(0, 8)} ${jpegInfo(this.eventThumbnail)}`);
    this.activeEvent.segments = [];
    this.activeEvent.thumbnailAt = this.eventThumbnailAt || undefined;
    this.publish('update', { scene: this.eventThumbnail });

    if (this.activeSegment && !this.segmentMoment) {
      this.publishSegment('segment-update');
    }
  }

  public needsThumbnail(): boolean {
    return this.needsEventThumbnail;
  }

  public hasActiveEvent(): boolean {
    return this.activeEvent !== null;
  }

  private startEvent(triggers: EventTrigger[], data: ProcessedDetectionData, now: number): void {
    this.trace.reset();
    this.activeEvent = {
      id: randomUUID(),
      cameraId: this.cameraId,
      state: 'active',
      startTime: now,
      lastUpdate: now,
      types: [],
      triggers: [...triggers],
      segments: [],
      expectedEndTime: data.expectedEndTime,
    };
    this.segmentIndex = 0;
    this.needsEventThumbnail = true;
    this.eventThumbnail = null;
    this.eventThumbnailAt = 0;
    if (data.eventThumbnail) {
      this.eventThumbnail = data.eventThumbnail;
      this.eventThumbnailAt = now;
      this.needsEventThumbnail = false;
    }

    this.updateTypes();

    // a pre-captured scene ships with the start message, otherwise the next
    // coordinator tick delivers it via update
    if (this.eventThumbnail) {
      this.activeEvent.thumbnailAt = this.eventThumbnailAt || undefined;
    }
    this.publish('start', this.eventThumbnail ? { scene: this.eventThumbnail } : undefined);

    const triggerTypes = [...new Set(triggers.map((t) => t.type))].join(',');
    const thumbInfo = this.eventThumbnail ? jpegInfo(this.eventThumbnail) : 'pending';
    this.logger.log(`[event] start id=${this.activeEvent.id.slice(0, 8)} triggers=[${triggerTypes}] types=[${this.activeEvent.types.join(',')}] thumb=${thumbInfo}`);

    if (this.hasNewDetections(data) && data.hasOpenSpans) {
      this.openSegment(data, now);
    }
  }

  private endEvent(): void {
    if (!this.activeEvent) return;

    this.closeSegment();

    this.activeEvent.state = 'ended';
    this.activeEvent.endTime = Date.now();
    this.activeEvent.lastUpdate = this.activeEvent.endTime;
    this.activeEvent.segments = [];
    this.eventThumbnail = null;
    this.needsEventThumbnail = false;

    // ticks after the last segment closed (linger, motion without objects)
    const trace = this.trace.take();
    this.publish('end', trace ? { trace } : undefined);

    const duration = this.activeEvent.endTime - this.activeEvent.startTime;
    this.logger.log(`[event] end id=${this.activeEvent.id.slice(0, 8)} duration=${duration}ms segments=${this.segmentIndex} types=[${this.activeEvent.types.join(',')}]`);

    this.activeEvent = null;
    this.activeSegment = null;
    this.segmentClosePendingSince = null;
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = null;
    }
    this.eventPlateVotes.clear();

    if (this.onEventEndCallback) {
      this.onEventEndCallback();
    }
  }

  private openSegment(data: ProcessedDetectionData, now: number): void {
    if (!this.activeEvent) return;

    this.activeSegment = {
      firstSeen: now,
      lastSeen: now,
      detections: [],
      attributes: [],
    };
    this.segmentTrackPaths = new Map();
    this.enrichSegment(data, now);

    // the tick cuts its moment before it opens the segment, and both carry the
    // tick's stamp, so an older one belongs to a tick that opened nothing
    const pending = this.pendingMoment;
    this.pendingMoment = undefined;
    if (pending?.capturedAt === now) {
      this.takeMoment(pending);
    }

    if (data.thumbnails && data.thumbnails.length > 0) {
      this.updateThumbnails(data.thumbnails);
    }

    this.activeEvent.lastUpdate = now;
    this.updateTypes();
    this.publishSegment('segment-start');
  }

  private upsertPlateAttribute(attrKey: string, label: string, confidence: number, parentTrackId: number | undefined): void {
    if (!this.activeSegment) return;

    const existingIdx = this.segmentPlateAttrIndex.get(attrKey);
    if (existingIdx !== undefined) {
      const existing = this.activeSegment.attributes[existingIdx];
      if (existing) {
        existing.label = label;
        existing.confidence = confidence;
      }
      return;
    }

    this.segmentPlateAttrIndex.set(attrKey, this.activeSegment.attributes.length);
    this.pushAttribute({ type: 'license_plate', label, confidence, parentTrackId });
  }

  private flushPlateFallbacks(): void {
    if (!this.activeSegment || !this.plateVotingActive) return;

    for (const bucketKey of this.segmentPlateReads) {
      const votes = this.eventPlateVotes.get(bucketKey);
      if (!votes) continue;

      const hasAttribute = bucketKey === 'untracked' ? [...this.segmentPlateAttrIndex.keys()].some((k) => k.startsWith('u')) : this.segmentPlateAttrIndex.has(bucketKey);
      if (hasAttribute) continue;

      const best = votes.bestEffort();
      if (!best) continue;

      const parentTrackId = bucketKey === 'untracked' ? undefined : Number(bucketKey.slice(1));
      this.upsertPlateAttribute(bucketKey === 'untracked' ? `u${best.id}` : bucketKey, best.best, best.bestConfidence, parentTrackId);
    }
  }

  private closeSegment(): void {
    if (!this.activeSegment || !this.activeEvent) return;

    // lastSeen stays on the last real detection: the linger only delays the
    // decision to close, it is not part of what was seen
    this.flushPlateFallbacks();
    this.publishSegment('segment-end');
    this.clearSegmentThumbnails();

    this.segmentIndex++;
    this.activeSegment = null;
  }

  private enrichTriggers(triggers: EventTrigger[], now: number): void {
    if (!this.activeEvent) return;

    for (const incoming of triggers) {
      const existing = this.activeEvent.triggers.find((t) => t.type === incoming.type && t.label === incoming.label);

      if (existing) {
        existing.lastSeen = now;
        if (incoming.score !== undefined && (existing.score === undefined || incoming.score > existing.score)) {
          existing.score = incoming.score;
        }
      } else {
        this.activeEvent.triggers.push({ ...incoming });
      }
    }
  }

  private enrichSegment(data: ProcessedDetectionData, now: number): void {
    if (!this.activeSegment) return;

    this.activeSegment.lastSeen = now;

    if (data.objects.length > 0) {
      const labelCounts = new Map<string, { count: number; bestScore: number; bestBox?: BoundingBox; bestTrackId?: number; moving?: boolean; anyMoving: boolean }>();
      for (const obj of data.objects) {
        const t = obj as { trackId?: number; trackSpeed?: number; stationarySince?: number; label: string; confidence: number; box: BoundingBox };
        if (t.trackId !== undefined && obj.box) {
          const cx = obj.box.x + obj.box.width / 2;
          const cy = obj.box.y + obj.box.height / 2;
          const path = this.segmentTrackPaths.get(t.trackId);
          if (path) {
            path.exitX = cx;
            path.exitY = cy;
          } else {
            this.segmentTrackPaths.set(t.trackId, { enterX: cx, enterY: cy, exitX: cx, exitY: cy });
          }
        }
        // a settled track's box jitter clears the speed floor; settled is not moving
        const moving = t.trackSpeed !== undefined ? t.trackSpeed >= STATIONARY_SPEED_THRESHOLD && t.stationarySince === undefined : undefined;
        const entry = labelCounts.get(obj.label);
        if (entry) {
          entry.count++;
          if (moving === true) entry.anyMoving = true;
          if (obj.confidence > entry.bestScore) {
            entry.bestScore = obj.confidence;
            entry.bestBox = obj.box;
            entry.bestTrackId = t.trackId;
            entry.moving = moving;
          }
        } else {
          labelCounts.set(obj.label, {
            count: 1,
            bestScore: obj.confidence,
            bestBox: obj.box,
            bestTrackId: t.trackId,
            moving,
            anyMoving: moving === true,
          });
        }
      }

      for (const [label, { count, bestScore, bestBox, bestTrackId, moving, anyMoving }] of labelCounts) {
        const existing = this.activeSegment.detections.find((d) => d.label === label);
        if (existing) {
          if (bestScore > existing.score) {
            existing.score = bestScore;
            existing.box = bestBox;
            existing.trackId = bestTrackId;
            existing.moving = moving;
          }
          if (count > existing.maxCount) existing.maxCount = count;
          existing.lastSeen = now;
          if (anyMoving) {
            existing.firstMovingSeen ??= now;
            existing.lastMovingSeen = now;
          }
        } else {
          this.activeSegment.detections.push({
            label,
            score: bestScore,
            maxCount: count,
            box: bestBox,
            trackId: bestTrackId,
            moving,
            firstSeen: now,
            lastSeen: now,
            firstMovingSeen: anyMoving ? now : undefined,
            lastMovingSeen: anyMoving ? now : undefined,
          });
        }
      }

      for (const d of this.activeSegment.detections) {
        if (d.trackId === undefined) continue;
        const path = this.segmentTrackPaths.get(d.trackId);
        if (path) d.path = path;
      }

      // boxes and polygons are both normalized 0-1, direct overlap test.
      // Per-label hits matter on their own: an alert zone gates pushes per
      // label, so "the car was in the driveway" must not vouch for the person
      // on the road.
      if (data.detectionZones && data.detectionZones.length > 0) {
        const labelZones = new Map<string, Set<string>>();
        for (const detection of this.activeSegment.detections) {
          if (detection.zones?.length) labelZones.set(detection.label, new Set(detection.zones));
        }

        for (const obj of data.objects) {
          let hits = labelZones.get(obj.label);
          if (!hits) {
            hits = new Set<string>();
            labelZones.set(obj.label, hits);
          }
          for (const zone of data.detectionZones) {
            if (hits.has(zone.name)) continue;
            if (zoneHit(obj.box, zone)) {
              hits.add(zone.name);
            }
          }
        }

        const alertZones = data.detectionZones.filter((zone) => zone.alertLabels !== undefined);
        const zonesSet = new Set<string>(this.activeSegment.zones ?? []);
        for (const detection of this.activeSegment.detections) {
          const hits = labelZones.get(detection.label);
          detection.alert = mayAlert(detection.label, detection.box, hits, alertZones);
          if (!hits || hits.size === 0) continue;
          detection.zones = [...hits];
          for (const name of hits) zonesSet.add(name);
        }
        if (zonesSet.size > 0) {
          this.activeSegment.zones = [...zonesSet];
        }
      }
    }

    for (const face of data.faces) {
      if (face.confidence < (data.faceMinConfidence ?? 0)) continue;
      if (face.identity) {
        if (!this.activeSegment.attributes.some((a) => a.type === 'face' && a.label === face.identity)) {
          this.pushAttribute({ type: 'face', label: face.identity, parentTrackId: face.parentTrackId });
        }
      } else if (face.embedding?.length) {
        // one slot per person, and one shared slot for faces the tracker could
        // not attach to anyone: without a track there is nothing to tell two
        // strangers apart by, and a slot per sighting would file the same face
        // into the index on every tick
        const bucket = face.parentTrackId !== undefined ? `t${face.parentTrackId}` : 'untracked';
        const existingIdx = this.segmentFaceTrackIds.get(bucket);
        if (existingIdx !== undefined) {
          const existing = this.activeSegment.attributes[existingIdx];
          if (existing && face.confidence > (existing.confidence ?? 0)) {
            existing.confidence = face.confidence;
            this.heldAttributes[existingIdx] = { thumbnail: face.thumbnail, embedding: face.embedding, embeddingModel: data.faceEmbeddingModel };
          }
          continue;
        }
        this.segmentFaceTrackIds.set(bucket, this.activeSegment.attributes.length);
        this.pushAttribute(
          { type: 'face', label: 'unknown', confidence: face.confidence, parentTrackId: face.parentTrackId },
          { thumbnail: face.thumbnail, embedding: face.embedding, embeddingModel: data.faceEmbeddingModel },
        );
      }
    }

    this.plateVotingActive = data.plateVoting !== false;

    for (const plate of data.plates) {
      if (!plate.plateText) continue;

      if (!this.plateVotingActive) {
        // external provider: the camera already vetted the read, keep it as-is
        const label = normalizePlateText(plate.plateText) || plate.plateText;
        const existing = this.activeSegment.attributes.find((a) => a.type === 'license_plate' && a.label === label);
        if (existing) {
          if (plate.confidence > (existing.confidence ?? 0)) existing.confidence = plate.confidence;
        } else {
          this.pushAttribute({ type: 'license_plate', label, confidence: plate.confidence, parentTrackId: plate.parentTrackId });
        }
        continue;
      }

      // illegible reads never become candidates; old plugins without ocrConfidence pass
      if (plate.ocrConfidence !== undefined && plate.ocrConfidence < (data.plateMinConfidence ?? 0)) continue;

      // vote per vehicle so flickering OCR reads converge on one plate instead of
      // surfacing every misread; untracked reads share one bucket but may yield
      // several winners (multiple untracked vehicles)
      const bucketKey = plate.parentTrackId !== undefined ? `t${plate.parentTrackId}` : 'untracked';
      let votes = this.eventPlateVotes.get(bucketKey);
      if (!votes) {
        votes = new PlateVoteTracker();
        this.eventPlateVotes.set(bucketKey, votes);
      }
      votes.add(plate.plateText, plate.ocrConfidence ?? plate.confidence, data.plateMinLength);
      this.segmentPlateReads.add(bucketKey);

      if (bucketKey === 'untracked') {
        for (const cluster of votes.winners().slice(0, MAX_UNTRACKED_PLATES)) {
          this.upsertPlateAttribute(`u${cluster.id}`, cluster.best, cluster.bestConfidence, undefined);
        }
      } else {
        const winner = votes.winners()[0];
        if (winner) this.upsertPlateAttribute(bucketKey, winner.best, winner.bestConfidence, plate.parentTrackId);
      }
    }

    for (const cls of data.classifiers) {
      if (!cls.subAttribute) continue;

      if (cls.parentTrackId !== undefined) {
        const clsKey = `${cls.parentTrackId}:${cls.attribute}`;
        const existingIdx = this.segmentClassifierTrackIds.get(clsKey);
        if (existingIdx !== undefined) {
          const existing = this.activeSegment.attributes[existingIdx];
          if (existing && cls.confidence > (existing.confidence ?? 0)) {
            existing.label = cls.subAttribute;
            existing.confidence = cls.confidence;
          }
          continue;
        }
        this.segmentClassifierTrackIds.set(clsKey, this.activeSegment.attributes.length);
      } else if (this.activeSegment.attributes.some((a) => a.type === cls.attribute && a.label === cls.subAttribute)) {
        continue;
      }

      this.pushAttribute({ type: cls.attribute, label: cls.subAttribute, confidence: cls.confidence, parentTrackId: cls.parentTrackId });
    }

    for (const clip of data.clips) {
      if (clip.embedding?.length) {
        // one embedding per subject actually present, not per track: a
        // re-numbered track is the same person and would otherwise land in the
        // search index again, while two real people must keep both appearances
        const stored = this.segmentClipLabels.get(clip.label) ?? 0;
        const present = this.activeSegment.detections.find((d) => d.label === clip.label)?.maxCount ?? 1;
        if (stored >= Math.max(1, present)) continue;
        this.segmentClipLabels.set(clip.label, stored + 1);
        this.pushAttribute(
          { type: 'clip', label: clip.label, parentTrackId: clip.parentTrackId },
          { clipEmbedding: clip.embedding, clipEmbeddingModel: data.clipEmbeddingModel },
        );
      }
    }
  }

  private pushAttribute(attribute: RecordedAttribute, held?: HeldAttribute): void {
    if (!this.activeSegment) return;
    this.activeSegment.attributes.push(attribute);
    this.heldAttributes[this.activeSegment.attributes.length - 1] = held ?? {};
  }

  private extractTriggers(data: ProcessedDetectionData, now: number): EventTrigger[] {
    const triggers: EventTrigger[] = [];

    if (data.motion?.detected) {
      triggers.push({ type: 'motion', firstSeen: now, lastSeen: now });
    } else if (data.cascadeTriggered && !data.motion && (!data.sensorTriggers || data.sensorTriggers.length === 0)) {
      // external motion, backward compatible: no specific sensor trigger
      triggers.push({ type: 'motion', firstSeen: now, lastSeen: now });
    }

    if (data.audio?.detected) {
      if (data.audio.detections.length > 0) {
        for (const d of data.audio.detections) {
          triggers.push({ type: 'audio', label: d.attribute ?? d.label, score: d.confidence, firstSeen: now, lastSeen: now });
        }
      } else {
        triggers.push({ type: 'audio', firstSeen: now, lastSeen: now });
      }
    }

    if (data.sensorTriggers && data.sensorTriggers.length > 0) {
      for (const type of data.sensorTriggers) {
        triggers.push({ type: type as EventTriggerType, firstSeen: now, lastSeen: now });
      }
    }

    if (data.lineCrossings && data.lineCrossings.length > 0) {
      for (const lc of data.lineCrossings) {
        triggers.push({
          type: 'line-crossing',
          label: lc.label,
          score: lc.confidence,
          lineName: lc.lineName,
          crossingDirection: lc.direction,
          trackId: lc.trackId,
          firstSeen: now,
          lastSeen: now,
        });
      }
    }

    return triggers;
  }

  private updateTypes(): void {
    if (!this.activeEvent) return;

    const types = new Set<string>(this.activeEvent.types);

    for (const t of this.activeEvent.triggers) types.add(t.type);
    // activeEvent.segments is only filled during publishSegment, include the
    // current activeSegment for up-to-date types
    const segs = this.activeSegment ? [this.activeSegment] : this.activeEvent.segments;
    for (const seg of segs) {
      for (const d of seg.detections) types.add(d.label);
      for (const attr of seg.attributes) {
        if (attr.type === CLIP_ATTRIBUTE) continue;
        types.add(attr.type);
      }
    }

    this.activeEvent.types = [...types];
  }

  private hasNewDetections(data: ProcessedDetectionData): boolean {
    return data.objects.length > 0 || data.faces.length > 0 || data.plates.length > 0 || data.classifiers.length > 0;
  }

  private updateThumbnails(thumbnails: DetectionThumbnail[]): void {
    for (const thumb of thumbnails) {
      const label = thumb.label;
      if (!label.startsWith('face:') && !label.startsWith('plate:') && !label.startsWith('class:')) continue;
      // once a track's face resolved to an identity, its earlier and later
      // "unknown" crops are the same person, not a second thumbnail
      if (label.startsWith('face:') && label !== 'face:unknown' && thumb.trackId !== undefined) {
        this.identifiedFaceTracks.add(thumb.trackId);
        const unknown = this.attributeThumbnails.get('face:unknown');
        if (unknown?.trackId === thumb.trackId) this.attributeThumbnails.delete('face:unknown');
      }
      if (label === 'face:unknown' && thumb.trackId !== undefined && this.identifiedFaceTracks.has(thumb.trackId)) continue;
      this.updateBestCandidate(this.attributeThumbnails, label, thumb);
      // a moving vehicle produces a distinct plate crop almost every frame, cap retention
      if (label.startsWith('plate:')) this.prunePlateThumbnails();
    }
  }

  private prunePlateThumbnails(): void {
    const plates = [...this.attributeThumbnails].filter(([key]) => key.startsWith('plate:'));
    if (plates.length <= DetectionEventManager.MAX_PLATE_THUMBNAILS) return;
    plates.sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0));
    for (let i = 0; i < plates.length - DetectionEventManager.MAX_PLATE_THUMBNAILS; i++) {
      this.attributeThumbnails.delete(plates[i][0]);
    }
  }

  private updateBestCandidate(map: Map<string, ThumbnailCandidate>, key: string, thumb: DetectionThumbnail): void {
    const current = map.get(key);
    const candidate: ThumbnailCandidate = {
      jpeg: thumb.jpeg,
      score: thumb.score,
      area: thumb.area,
      onEdge: thumb.onEdge,
      hasAttribute: true,
      trackId: thumb.trackId,
      speed: thumb.speed,
    };

    if (!current) {
      map.set(key, candidate);
      return;
    }

    const cm = DetectionEventManager.isMoving(candidate);
    const currM = DetectionEventManager.isMoving(current);

    if (cm && !currM) {
      this.logger.trace(`Thumbnail ${key}: prefer moving track#${candidate.trackId} (speed=${candidate.speed?.toFixed(4)}) over static track#${current.trackId}`);
      map.set(key, candidate);
      return;
    }
    if (!cm && currM) return;

    if (!candidate.onEdge && (candidate.area > current.area || candidate.score > current.score)) {
      map.set(key, candidate);
    }
  }

  private static isMoving(c: ThumbnailCandidate): boolean {
    return (c.speed ?? 0) >= MIN_MOVING_SPEED;
  }

  private segmentAttachments(withEmbeddings: boolean): EventAttachments {
    const attachments: EventAttachments = {};

    const moment = this.segmentMoment;
    if (moment && moment.capturedAt !== this.shippedSceneAt) {
      attachments.strip = moment.strip;
      attachments.card = moment.card;
      this.shippedSceneAt = moment.capturedAt;
    }

    const attributes = this.activeSegment?.attributes ?? [];
    const crops: (Uint8Array | undefined)[] = [];
    let anyCrop = false;

    for (const [index, attribute] of attributes.entries()) {
      const held = this.heldAttributes[index];
      const crop = held?.thumbnail ?? this.attributeThumbnailFor(attribute);

      if (crop?.length && this.shippedAttributes.get(index) !== crop) {
        this.shippedAttributes.set(index, crop);
        crops.push(crop);
        anyCrop = true;
      } else {
        crops.push(undefined);
      }

      // embeddings are write-only into the face and clip indexes, and the
      // recorder reads them once when the segment closes
      if (withEmbeddings && held) {
        if (held.embedding) {
          attribute.embedding = held.embedding;
          attribute.embeddingModel = held.embeddingModel;
        }
        if (held.clipEmbedding) {
          attribute.clipEmbedding = held.clipEmbedding;
          attribute.clipEmbeddingModel = held.clipEmbeddingModel;
        }
      }
    }

    if (anyCrop) attachments.attributes = crops;
    return attachments;
  }

  private attributeThumbnailFor(attribute: RecordedAttribute): Buffer | undefined {
    const keys = [`face:${attribute.label}`, `plate:${attribute.label}`, `class:${attribute.label}`];
    const directKey = `${attribute.type}:${attribute.label}`;
    if (!keys.includes(directKey)) keys.unshift(directKey);

    for (const key of keys) {
      const candidate = this.attributeThumbnails.get(key);
      if (candidate) return candidate.jpeg;
    }
    return undefined;
  }

  private takeMoment(moment: SegmentMoment): void {
    if (!this.beatsMoment(moment.rank, moment.score, moment.stream, this.segmentMoment)) {
      // debugging
      this.recordMomentVerdict(moment, 'rejected');
      return;
    }
    // debugging
    this.recordMomentVerdict(moment, 'kept');
    this.segmentMoment = moment;
  }

  private heldMomentInfo(): Record<string, unknown> | undefined {
    const held = this.segmentMoment;
    if (!held) return undefined;
    return { capturedAt: held.capturedAt, score: held.score, rank: held.rank, stream: held.stream };
  }

  private incumbentMoment(at: number): SegmentMoment | undefined {
    if (this.activeSegment) return this.segmentMoment;
    return this.pendingMoment?.capturedAt === at ? this.pendingMoment : undefined;
  }

  private beatsMoment(rank: number, score: number, stream: AnalysisStream, held?: SegmentMoment): boolean {
    if (!held) return true;
    if (rank !== held.rank) return rank > held.rank;
    // the score is normalized, so it cannot see that a main-stream crop is the
    // same framing with several times the pixels: that one only has to tie
    if (stream === 'main' && held.stream === 'low') return score > held.score;
    return score > held.score * MOMENT_IMPROVEMENT;
  }

  // debugging
  private recordMomentVerdict(moment: SegmentMoment, verdict: 'kept' | 'rejected' | 'pending'): void {
    if (!detectionRecord.active) return;
    detectionRecord.momentVerdict({
      verdict,
      capturedAt: moment.capturedAt,
      score: moment.score,
      rank: moment.rank,
      stream: moment.stream,
      held: this.heldMomentInfo(),
      eventId: this.activeEvent?.id.slice(0, 8),
      segment: this.activeSegment ? this.segmentIndex : undefined,
    });
  }

  private clearSegmentThumbnails(): void {
    this.shippedSceneAt = 0;
    this.segmentMoment = undefined;
    this.pendingMoment = undefined;
    this.attributeThumbnails.clear();
    this.identifiedFaceTracks.clear();
    this.heldAttributes = [];
    this.shippedAttributes.clear();
    this.segmentFaceTrackIds.clear();
    this.segmentPlateAttrIndex.clear();
    this.segmentPlateReads.clear();
    this.segmentClassifierTrackIds.clear();
    this.segmentClipLabels.clear();
  }

  private publish(type: DetectionEventType, attachments?: EventAttachments): void {
    if (!this.activeEvent) return;
    const message: DetectionEventMessage = { type, data: leanEvent(this.activeEvent) };
    this.proxy.publish(this.eventSubject, message);
    this.nvr.send(type, this.activeEvent, attachments);
    // debugging
    this.recordMessage(type, attachments);
    this.lastPublishTime = Date.now();
  }

  // debugging
  private recordMessage(type: DetectionEventType, attachments?: EventAttachments): void {
    if (!detectionRecord.active || !this.activeEvent) return;

    const at = this.segmentMoment?.capturedAt ?? this.activeEvent.lastUpdate;
    const segment = this.activeSegment;
    const attributes = segment?.attributes ?? [];

    detectionRecord.message({
      type,
      eventId: this.activeEvent.id.slice(0, 8),
      segment: segment ? this.segmentIndex : undefined,
      types: this.activeEvent.types,
      recorderReachable: this.nvr.connected,
      detections: segment?.detections.map((d) => ({ label: d.label, score: d.score, count: d.maxCount, track: d.trackId, moving: d.moving })),
      attributes: attributes.map((a) => ({ type: a.type, label: a.label, confidence: a.confidence, parent: a.parentTrackId })),
      sent: {
        scene: attachments?.scene ? detectionRecord.picture(this.eventThumbnailAt || at, 'scene', 'event', attachments.scene) : undefined,
        strip: attachments?.strip ? detectionRecord.picture(at, 'moment', 'strip', attachments.strip) : undefined,
        card: attachments?.card ? detectionRecord.picture(at, 'moment', 'card', attachments.card) : undefined,
        attributes: attachments?.attributes?.map((crop, index) =>
          crop ? detectionRecord.picture(at, 'attr', `${attributes[index]?.type}-${attributes[index]?.label}`, crop) : undefined,
        ),
      },
      momentStream: this.segmentMoment?.stream,
      momentAt: this.segmentMoment?.capturedAt,
    });
  }

  private publishSegment(type: 'segment-start' | 'segment-update' | 'segment-end'): void {
    if (!this.activeEvent || !this.activeSegment) return;

    this.activeEvent.segments = [this.activeSegment];
    this.activeEvent.segmentIndex = this.segmentIndex;

    this.logSegment(type);

    const moment = this.segmentMoment;
    if (moment) this.activeSegment.thumbnailAt = moment.capturedAt;

    const attachments = this.segmentAttachments(type === 'segment-end');
    // ticks ride every segment message: they reach the store while the
    // segment runs, and a crash costs a second of trace, not the segment
    if (type !== 'segment-start') attachments.trace = this.trace.take();
    this.publish(type, attachments);
  }

  private publishSegmentThrottled(type: 'segment-update'): void {
    const now = Date.now();
    if (now - this.lastPublishTime >= UPDATE_THROTTLE_MS) {
      this.publishSegment(type);
    }
  }

  private publishUpdateThrottled(): void {
    const now = Date.now();
    if (now - this.lastPublishTime >= UPDATE_THROTTLE_MS) {
      this.activeEvent!.segments = [];
      this.publish('update');
    }
  }

  private logSegment(type: 'segment-start' | 'segment-update' | 'segment-end'): void {
    if (!this.activeEvent || !this.activeSegment) return;

    const seg = this.activeSegment;
    const parts: string[] = [`[event] ${type}`, `id=${this.activeEvent.id.slice(0, 8)}`, `seg=${this.segmentIndex}`];

    if (type === 'segment-end') {
      parts.push(`duration=${seg.lastSeen - seg.firstSeen}ms`);
    }

    // "person(0.92,x2) vehicle(0.78,x1)"
    if (seg.detections.length > 0) {
      const dets = seg.detections.map((d) => `${d.label}(${d.score.toFixed(2)},x${d.maxCount})`).join(' ');
      parts.push(`det=[${dets}]`);
    }

    if (seg.attributes.length > 0) {
      const groups = new Map<string, string[]>();
      for (const [index, a] of seg.attributes.entries()) {
        const held = this.heldAttributes[index];
        const list = groups.get(a.type) ?? [];
        let info = a.label;
        if (a.confidence) info += `(${a.confidence.toFixed(2)})`;
        if (held?.embedding?.length || held?.clipEmbedding?.length) info += '+emb';
        if (held?.thumbnail ?? this.attributeThumbnailFor(a)) info += '+thumb';
        list.push(info);
        groups.set(a.type, list);
      }
      const attr = [...groups.entries()].map(([t, items]) => `${t}:[${items.join(',')}]`).join(' ');
      parts.push(`attr={${attr}}`);
    }

    const tracked = seg.detections.filter((d) => d.trackId !== undefined);
    if (tracked.length > 0) {
      const info = tracked
        .map((d) => {
          let s = `${d.label}#${d.trackId}`;
          if (d.moving !== undefined) s += d.moving ? ',moving' : ',static';
          return s;
        })
        .join(' ');
      parts.push(`tracker=[${info}]`);
    }

    if (seg.zones?.length) {
      parts.push(`zones=[${seg.zones.join(',')}]`);
    }

    const thumbParts: string[] = [];
    const moment = this.segmentMoment;
    if (moment) {
      const shows = moment.rank >= MOMENT_RANK_ATTRIBUTE ? 'attr' : 'obj';
      thumbParts.push(`moment(${shows},${moment.stream}):${jpegInfo(moment.strip)}${moment.card ? `+card:${jpegInfo(moment.card)}` : ''}`);
    }
    for (const [label, cand] of this.attributeThumbnails) thumbParts.push(`${label}:${jpegInfo(cand.jpeg)}`);
    parts.push(`thumbs=${thumbParts.length}${thumbParts.length > 0 ? ` [${thumbParts.join(' ')}]` : ''}`);

    this.logger.trace(parts.join(' '));
  }
}
