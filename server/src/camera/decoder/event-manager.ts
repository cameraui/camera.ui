import { randomUUID } from 'node:crypto';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { boxIntersectsPolygon } from '../utils/filter.js';
import { MAX_UNTRACKED_PLATES, normalizePlateText, PlateVoteTracker } from './plate-vote.js';
import { STATIONARY_SPEED_THRESHOLD } from './stationary-suppressor.js';

import type { RPCClient } from '@camera.ui/rpc';
import type {
  BoundingBox,
  ClassifierDetection,
  ClipEmbedding,
  Detection,
  DetectionEvent,
  DetectionEventType,
  EventSegment,
  EventTrigger,
  EventTriggerType,
  FaceDetection,
  LicensePlateDetection,
  LoggerService,
  Point,
} from '@camera.ui/sdk';
import type { DetectionThumbnail } from '../../rpc/interfaces/detection.js';
import type { LineCrossingEvent } from './detection-pipeline.js';

export interface TrackedSecondary {
  parentTrackId?: number;
}

export interface TrackedFaceDetection extends FaceDetection, TrackedSecondary {}
export interface TrackedLicensePlateDetection extends LicensePlateDetection, TrackedSecondary {}
export interface TrackedClassifierDetection extends ClassifierDetection, TrackedSecondary {}
export interface TrackedClipEmbedding extends ClipEmbedding, TrackedSecondary {}

export interface NormalizedDetectionZone {
  name: string;
  // 0-1 normalized, closed (first point repeated)
  points: Point[];
}

export interface ProcessedDetectionData {
  hasCascadeTrigger: boolean;
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
}

const UPDATE_THROTTLE_MS = 1000;
const MIN_MOVING_SPEED = 0.05;

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

  private activeEvent: DetectionEvent | null = null;
  private activeSegment: EventSegment | null = null;
  private segmentTimer: NodeJS.Timeout | null = null;
  private segmentIndex = 0;
  private lastPublishTime = 0;

  private sceneThumbnail: ThumbnailCandidate | null = null;
  private sceneThumbnailShipped = false;
  private detectionLabelThumbnails = new Map<string, ThumbnailCandidate>();
  private attributeThumbnails = new Map<string, ThumbnailCandidate>();

  private eventThumbnail: Buffer | null = null;
  private needsEventThumbnail = false;

  private segmentFaceTrackIds = new Map<number, number>();
  private segmentPlateAttrIndex = new Map<string, number>();
  private segmentPlateReads = new Set<string>();
  private eventPlateVotes = new Map<string, PlateVoteTracker>();
  private plateVotingActive = true;
  private segmentClassifierTrackIds = new Map<string, number>();
  private segmentClipTrackIds = new Set<string>();

  private readonly eventSubject: string;
  private onEventEndCallback?: () => void;

  constructor(
    private readonly cameraId: string,
    private readonly proxy: RPCClient,
    private readonly logger: LoggerService,
  ) {
    const ns = NamespaceManager.detectionEventNamespaces(cameraId);
    this.eventSubject = ns.detectionEventSubject;
  }

  public onEventEnd(callback: () => void): void {
    this.onEventEndCallback = callback;
  }

  public processResults(data: ProcessedDetectionData): void {
    const now = data.timestamp;
    const triggers = this.extractTriggers(data, now);
    const hasDetections = this.hasNewDetections(data);

    if (triggers.length === 0 && !this.activeEvent) return;

    if (!this.activeEvent) {
      if (triggers.length === 0) return;
      this.startEvent(triggers, data, now);
      return;
    }

    // publish immediately, the UI shouldn't wait for the next throttled update
    if (data.eventThumbnail && this.needsEventThumbnail) {
      this.eventThumbnail = data.eventThumbnail;
      this.needsEventThumbnail = false;
      this.publishEventThumbnail();
    }

    if (triggers.length > 0) {
      this.enrichTriggers(triggers, now);
      this.activeEvent.lastUpdate = now;
      this.activeEvent.expectedEndTime = data.expectedEndTime;
      // keep-alive for the UI; with an active segment, segment-update carries this
      if (!this.activeSegment) {
        this.publishUpdateThrottled();
      }
    }

    if (hasDetections && data.hasCascadeTrigger) {
      if (!this.activeSegment) {
        this.openSegment(data, now);
      } else {
        this.enrichSegment(data, now);
        if (data.thumbnails && data.thumbnails.length > 0) {
          this.updateThumbnails(data.thumbnails);
        }
        this.activeEvent.lastUpdate = now;
        this.updateTypes();
        this.publishSegmentThrottled('segment-update');
      }
      this.resetSegmentTimer(data.segmentTimeout);
    }
  }

  public forceEndActiveEvent(): void {
    if (this.activeEvent) this.endEvent();
  }

  public destroy(): void {
    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
    if (this.activeEvent) this.endEvent();
  }

  public publishEventThumbnail(jpeg?: Buffer): void {
    if (!this.activeEvent) return;
    if (jpeg) {
      this.eventThumbnail = jpeg;
      this.needsEventThumbnail = false;
    }
    if (!this.eventThumbnail) return;
    this.logger.trace(`[event] thumbnail id=${this.activeEvent.id.slice(0, 8)} ${jpegInfo(this.eventThumbnail)}`);
    this.activeEvent.segments = [];
    this.activeEvent.thumbnail = this.eventThumbnail;
    this.publish('update');
    this.activeEvent.thumbnail = undefined;

    if (this.activeSegment && !this.sceneThumbnail) {
      this.sceneThumbnail = { jpeg: this.eventThumbnail, score: 0, area: 0, onEdge: false, hasAttribute: false };
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
    if (data.eventThumbnail) {
      this.eventThumbnail = data.eventThumbnail;
      this.needsEventThumbnail = false;
    }

    this.updateTypes();
    // pre-captured thumbnail rides inline in the start message, otherwise the
    // next coordinator tick delivers it via update
    if (this.eventThumbnail) {
      this.activeEvent.thumbnail = this.eventThumbnail;
    }
    this.publish('start');
    if (this.activeEvent) this.activeEvent.thumbnail = undefined;

    const triggerTypes = [...new Set(triggers.map((t) => t.type))].join(',');
    const thumbInfo = this.eventThumbnail ? jpegInfo(this.eventThumbnail) : 'pending';
    this.logger.log(`[event] start id=${this.activeEvent.id.slice(0, 8)} triggers=[${triggerTypes}] types=[${this.activeEvent.types.join(',')}] thumb=${thumbInfo}`);

    if (this.hasNewDetections(data) && data.hasCascadeTrigger) {
      this.openSegment(data, now);
      this.resetSegmentTimer(data.segmentTimeout);
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
    this.publish('end');

    const duration = this.activeEvent.endTime - this.activeEvent.startTime;
    this.logger.log(`[event] end id=${this.activeEvent.id.slice(0, 8)} duration=${duration}ms segments=${this.segmentIndex} types=[${this.activeEvent.types.join(',')}]`);

    this.activeEvent = null;
    this.activeSegment = null;
    this.eventPlateVotes.clear();

    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }

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
    this.enrichSegment(data, now);

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
    this.activeSegment.attributes.push({ type: 'license_plate', label, confidence, parentTrackId });
  }

  private flushPlateFallbacks(): void {
    if (!this.activeSegment || !this.plateVotingActive) return;

    for (const bucketKey of this.segmentPlateReads) {
      const votes = this.eventPlateVotes.get(bucketKey);
      if (!votes) continue;

      const hasAttribute =
        bucketKey === 'untracked' ? [...this.segmentPlateAttrIndex.keys()].some((k) => k.startsWith('u')) : this.segmentPlateAttrIndex.has(bucketKey);
      if (hasAttribute) continue;

      const best = votes.bestEffort();
      if (!best) continue;

      const parentTrackId = bucketKey === 'untracked' ? undefined : Number(bucketKey.slice(1));
      this.upsertPlateAttribute(bucketKey === 'untracked' ? `u${best.id}` : bucketKey, best.best, best.bestConfidence, parentTrackId);
    }
  }

  private closeSegment(): void {
    if (!this.activeSegment || !this.activeEvent) return;

    this.activeSegment.lastSeen = Date.now();

    this.flushPlateFallbacks();
    this.publishSegment('segment-end');
    this.clearSegmentThumbnails();

    this.segmentIndex++;
    this.activeSegment = null;

    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
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
      // upsert per label, keep best score/box/trackId and maxCount
      const labelCounts = new Map<string, { count: number; bestScore: number; bestBox?: BoundingBox; bestTrackId?: number; moving?: boolean }>();
      for (const obj of data.objects) {
        const t = obj as { trackId?: number; trackSpeed?: number; label: string; confidence: number; box: BoundingBox };
        const entry = labelCounts.get(obj.label);
        if (entry) {
          entry.count++;
          if (obj.confidence > entry.bestScore) {
            entry.bestScore = obj.confidence;
            entry.bestBox = obj.box;
            entry.bestTrackId = t.trackId;
            entry.moving = t.trackSpeed !== undefined ? t.trackSpeed >= STATIONARY_SPEED_THRESHOLD : undefined;
          }
        } else {
          labelCounts.set(obj.label, {
            count: 1,
            bestScore: obj.confidence,
            bestBox: obj.box,
            bestTrackId: t.trackId,
            moving: t.trackSpeed !== undefined ? t.trackSpeed >= STATIONARY_SPEED_THRESHOLD : undefined,
          });
        }
      }

      for (const [label, { count, bestScore, bestBox, bestTrackId, moving }] of labelCounts) {
        const existing = this.activeSegment.detections.find((d) => d.label === label);
        if (existing) {
          if (bestScore > existing.score) {
            existing.score = bestScore;
            existing.box = bestBox;
            existing.trackId = bestTrackId;
            existing.moving = moving;
          }
          if (count > existing.maxCount) existing.maxCount = count;
        } else {
          this.activeSegment.detections.push({ label, score: bestScore, maxCount: count, box: bestBox, trackId: bestTrackId, moving });
        }
      }

      // boxes and polygons are both normalized 0-1, direct overlap test
      if (data.detectionZones && data.detectionZones.length > 0) {
        const zonesSet = new Set<string>(this.activeSegment.zones ?? []);
        for (const obj of data.objects) {
          for (const zone of data.detectionZones) {
            if (zonesSet.has(zone.name)) continue;
            if (boxIntersectsPolygon(obj.box, zone.points)) {
              zonesSet.add(zone.name);
            }
          }
        }
        if (zonesSet.size > 0) {
          this.activeSegment.zones = [...zonesSet];
        }
      }
    }

    for (const face of data.faces) {
      if (face.identity) {
        if (!this.activeSegment.attributes.some((a) => a.type === 'face' && a.label === face.identity)) {
          this.activeSegment.attributes.push({ type: 'face', label: face.identity, parentTrackId: face.parentTrackId });
        }
      } else if (face.embedding?.length) {
        if (face.parentTrackId !== undefined) {
          const existingIdx = this.segmentFaceTrackIds.get(face.parentTrackId);
          if (existingIdx !== undefined) {
            const existing = this.activeSegment.attributes[existingIdx];
            if (existing && face.confidence > (existing.confidence ?? 0)) {
              existing.confidence = face.confidence;
              existing.embedding = face.embedding;
              existing.embeddingModel = data.faceEmbeddingModel;
              existing.thumbnail = face.thumbnail;
            }
            continue;
          }
          this.segmentFaceTrackIds.set(face.parentTrackId, this.activeSegment.attributes.length);
        }
        this.activeSegment.attributes.push({
          type: 'face',
          label: 'unknown',
          confidence: face.confidence,
          embedding: face.embedding,
          embeddingModel: data.faceEmbeddingModel,
          thumbnail: face.thumbnail,
          parentTrackId: face.parentTrackId,
        });
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
          this.activeSegment.attributes.push({ type: 'license_plate', label, confidence: plate.confidence, parentTrackId: plate.parentTrackId });
        }
        continue;
      }

      // vote per vehicle so flickering OCR reads converge on one plate instead of
      // surfacing every misread; untracked reads share one bucket but may yield
      // several winners (multiple untracked vehicles)
      const bucketKey = plate.parentTrackId !== undefined ? `t${plate.parentTrackId}` : 'untracked';
      let votes = this.eventPlateVotes.get(bucketKey);
      if (!votes) {
        votes = new PlateVoteTracker();
        this.eventPlateVotes.set(bucketKey, votes);
      }
      votes.add(plate.plateText, plate.confidence);
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

      this.activeSegment.attributes.push({ type: cls.attribute, label: cls.subAttribute, confidence: cls.confidence, parentTrackId: cls.parentTrackId });
    }

    for (const clip of data.clips) {
      if (clip.embedding?.length) {
        const clipKey = clip.parentTrackId !== undefined ? `${clip.parentTrackId}:${clip.label}` : clip.label;
        if (this.segmentClipTrackIds.has(clipKey)) continue;
        this.segmentClipTrackIds.add(clipKey);
        this.activeSegment.attributes.push({
          type: 'clip',
          label: clip.label,
          clipEmbedding: clip.embedding,
          clipEmbeddingModel: data.clipEmbeddingModel,
          parentTrackId: clip.parentTrackId,
        });
      }
    }
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

    const types = new Set<string>();

    for (const t of this.activeEvent.triggers) types.add(t.type);
    // activeEvent.segments is only filled during publishSegment, include the
    // current activeSegment for up-to-date types
    const segs = this.activeSegment ? [this.activeSegment] : this.activeEvent.segments;
    for (const seg of segs) {
      for (const d of seg.detections) types.add(d.label);
      for (const attr of seg.attributes) types.add(attr.type);
    }

    this.activeEvent.types = [...types];
  }

  private hasNewDetections(data: ProcessedDetectionData): boolean {
    return data.objects.length > 0 || data.faces.length > 0 || data.plates.length > 0 || data.classifiers.length > 0;
  }

  private resetSegmentTimer(timeoutSeconds: number): void {
    if (this.segmentTimer) clearTimeout(this.segmentTimer);
    this.segmentTimer = setTimeout(() => {
      this.segmentTimer = null;
      this.closeSegment();
    }, timeoutSeconds * 1000);
  }

  private updateThumbnails(thumbnails: DetectionThumbnail[]): void {
    for (const thumb of thumbnails) {
      const label = thumb.label;

      if (label.startsWith('face:') || label.startsWith('plate:') || label.startsWith('class:')) {
        this.updateBestCandidate(this.attributeThumbnails, label, thumb);
        // a moving vehicle produces a distinct plate crop almost every frame, cap retention
        if (label.startsWith('plate:')) this.prunePlateThumbnails();
      } else {
        const hasAttr = thumbnails.some((t) => t.label.startsWith('face:') || t.label.startsWith('plate:') || t.label.startsWith('class:'));
        const candidate: ThumbnailCandidate = {
          jpeg: thumb.jpeg,
          score: thumb.score,
          area: thumb.area,
          onEdge: thumb.onEdge,
          hasAttribute: hasAttr,
          trackId: thumb.trackId,
          speed: thumb.speed,
        };

        if (!this.sceneThumbnail || this.isBetterScene(candidate, this.sceneThumbnail)) {
          this.sceneThumbnail = candidate;
        }

        this.updateBestCandidate(this.detectionLabelThumbnails, label, thumb);
      }
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

    // prefer moving objects over stationary
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

  private isBetterScene(candidate: ThumbnailCandidate, current: ThumbnailCandidate): boolean {
    if (candidate.hasAttribute && !current.hasAttribute) return true;

    const cm = DetectionEventManager.isMoving(candidate);
    const currM = DetectionEventManager.isMoving(current);

    if (cm && !currM) {
      this.logger.trace(`Scene thumbnail: prefer moving track#${candidate.trackId} (speed=${candidate.speed?.toFixed(4)}) over static track#${current.trackId}`);
      return true;
    }
    if (!cm && currM) return false;
    if (candidate.onEdge && !current.onEdge) return false;
    if (candidate.score > current.score * 1.05) return true;
    if (candidate.area > current.area * 1.1) return true;
    return false;
  }

  private static isMoving(c: ThumbnailCandidate): boolean {
    return (c.speed ?? 0) >= MIN_MOVING_SPEED;
  }

  private injectSegmentThumbnails(): void {
    if (!this.activeSegment) return;

    if (this.sceneThumbnail) {
      this.activeSegment.thumbnail = this.sceneThumbnail.jpeg;
    }

    for (const detection of this.activeSegment.detections) {
      const detCand = this.detectionLabelThumbnails.get(detection.label);
      if (!detCand) continue;
      if (detCand.jpeg === this.sceneThumbnail?.jpeg) continue;
      detection.thumbnail = detCand.jpeg;
    }

    for (const attr of this.activeSegment.attributes) {
      if (attr.thumbnail) continue;

      const keys = [`face:${attr.label}`, `plate:${attr.label}`, `class:${attr.label}`];
      const directKey = `${attr.type}:${attr.label}`;
      if (!keys.includes(directKey)) keys.unshift(directKey);
      for (const key of keys) {
        const cand = this.attributeThumbnails.get(key);
        if (cand) {
          attr.thumbnail = cand.jpeg;
          break;
        }
      }
    }
  }

  private stripSegmentThumbnails(): void {
    if (!this.activeSegment) return;
    this.activeSegment.thumbnail = undefined;
    for (const det of this.activeSegment.detections) det.thumbnail = undefined;
    for (const attr of this.activeSegment.attributes) attr.thumbnail = undefined;
  }

  private clearSegmentThumbnails(): void {
    this.sceneThumbnail = null;
    this.sceneThumbnailShipped = false;
    this.detectionLabelThumbnails.clear();
    this.attributeThumbnails.clear();
    this.segmentFaceTrackIds.clear();
    this.segmentPlateAttrIndex.clear();
    this.segmentPlateReads.clear();
    this.segmentClassifierTrackIds.clear();
    this.segmentClipTrackIds.clear();
  }

  private publish(type: DetectionEventType): void {
    if (!this.activeEvent) return;
    this.proxy.publish(this.eventSubject, { type, data: this.activeEvent });
    this.lastPublishTime = Date.now();
  }

  private publishSegment(type: 'segment-start' | 'segment-update' | 'segment-end'): void {
    if (!this.activeEvent || !this.activeSegment) return;

    this.activeEvent.segments = [this.activeSegment];
    this.activeEvent.segmentIndex = this.segmentIndex;

    this.logSegment(type);

    if (type === 'segment-end') {
      this.injectSegmentThumbnails();
      this.publish(type);
    } else if (type === 'segment-start') {
      this.injectSegmentThumbnails();
      this.publish(type);
      this.sceneThumbnailShipped = this.sceneThumbnail !== null;
      this.stripSegmentThumbnails();
    } else if (!this.sceneThumbnailShipped && this.sceneThumbnail) {
      this.activeSegment.thumbnail = this.sceneThumbnail.jpeg;
      this.publish(type);
      this.activeSegment.thumbnail = undefined;
      this.sceneThumbnailShipped = true;
    } else {
      this.publish(type);
    }
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
      for (const a of seg.attributes) {
        const list = groups.get(a.type) ?? [];
        let info = a.label;
        if (a.confidence) info += `(${a.confidence.toFixed(2)})`;
        if (a.type === 'face' && a.embedding?.length) info += '+emb';
        if (a.type === 'face' && a.thumbnail) info += '+thumb';
        if (a.type === 'clip' && a.clipEmbedding?.length) info += '+emb';
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
    if (this.sceneThumbnail) thumbParts.push(`scene:${jpegInfo(this.sceneThumbnail.jpeg)}`);
    for (const [label, cand] of this.detectionLabelThumbnails) {
      thumbParts.push(cand.jpeg === this.sceneThumbnail?.jpeg ? `${label}:=scene` : `${label}:${jpegInfo(cand.jpeg)}`);
    }
    for (const [label, cand] of this.attributeThumbnails) thumbParts.push(`${label}:${jpegInfo(cand.jpeg)}`);
    parts.push(`thumbs=${thumbParts.length}${thumbParts.length > 0 ? ` [${thumbParts.join(' ')}]` : ''}`);

    this.logger.trace(parts.join(' '));
  }
}
