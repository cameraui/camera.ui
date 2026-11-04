import { randomUUID } from 'node:crypto';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { jpegSize } from '../../utils/image.js';
import { boxAnchorInPolygon, boxInsidePolygon, boxIntersectsPolygon } from '../utils/filter.js';
import { detectionRecord } from './debug/detection-record.js';
import { iou } from './detection-window.js';
import { EventTraceCollector } from './event-trace.js';
import { faceNote } from './face-tracks.js';
import { leanEvent, NvrSink } from './nvr-sink.js';
import { MAX_UNTRACKED_PLATES, normalizePlateText, PlateVoteTracker } from './plate-vote.js';
import { TrainingSink } from './training-sink.js';
import { isFullFrameBox, isMovingTrack, OBJECT_MERGE_IOU_THRESHOLD } from './types.js';

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
  LicensePlateDetection,
  LoggerService,
  Point,
} from '@camera.ui/sdk';
import type { DetectionEventMessage } from '@camera.ui/sdk/internal';
import type { TrainingBoxSource } from '../../api/database/types.js';
import type { TrainingCandidateBox } from '../../rpc/interfaces/core.js';
import type { DetectionThumbnail, ServerFaceDetection, TrainingSuggestion } from '../../rpc/interfaces/detection.js';
import type { LineCrossingEvent } from './detection-pipeline.js';
import type { TraceFaceRead, TraceTick } from './event-trace.js';
import type { EventAttachments, RecordedAttribute, RecordedEvent, RecordedPersonEmbedding, RecordedSegment } from './nvr-sink.js';
import type { PerfTracker } from './perf-tracker.js';
import type { SceneObservation, TrainingSubject } from './training-sink.js';
import type { AnalysisStream } from './types.js';

export interface TrackedSecondary {
  parentTrackId?: number;
  parentBox?: BoundingBox;
}

export interface TrackedFaceDetection extends ServerFaceDetection, TrackedSecondary {}
export interface TrackedLicensePlateDetection extends LicensePlateDetection, TrackedSecondary {}
export interface TrackedClassifierDetection extends ClassifierDetection, TrackedSecondary {}
export interface TrackedClipEmbedding extends ClipEmbedding, TrackedSecondary {
  onEdge?: boolean;
}

export interface TrackedPersonEmbedding {
  trackId: number;
  embedding: number[];
}

export interface NormalizedDetectionZone {
  name: string;
  points: Point[];
  match?: AlertZoneMatch;
  alertLabels?: string[];
}

export const SECONDARY_FRESH_MS = 1000;
export const MOMENT_RANK_OBJECT = 0;
export const MOMENT_RANK_ATTRIBUTE = 1;

export interface SegmentMoment {
  strip: Buffer;
  card?: Buffer;
  stripWindow?: BoundingBox;
  cardWindow?: BoundingBox;
  capturedAt: number;
  shownAt?: number;
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
  heldSensorTriggers?: string[];
  startedSensorTrigger?: string;
  objects: Detection[];
  faces: TrackedFaceDetection[];
  facesAt?: number;
  faceEmbeddingModel?: string;
  plates: TrackedLicensePlateDetection[];
  platesAt?: number;
  plateVoting?: boolean;
  plateMinConfidence?: number;
  plateMinLength?: number;
  faceMinConfidence?: number;
  classifiers: TrackedClassifierDetection[];
  classifiersAt?: number;
  clips: TrackedClipEmbedding[];
  clipsAt?: number;
  clipEmbeddingModel?: string;
  thumbnails?: DetectionThumbnail[];
  eventThumbnail?: Buffer;
  trainingFrame?: Buffer;
  trainingSubjects?: TrainingSubject[];
  trainingExtras?: Detection[];
  trainingSuggestions?: TrainingSuggestion[];
  trainingDetector?: string;
  staticObjects?: Detection[];
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
const CLIP_VIEW_GROWTH = 1.5;
const FACE_MEANS_APART = 0.3;
const FACE_MEAN_MIN_FACES = 5;
const OCCURRENCE_GAP_MS = 10_000;
const MAX_OCCURRENCES = 50;

function unitVector(values: number[]): number[] {
  let norm = 0;
  for (const value of values) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return values.map((value) => value / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA * normB) || 1);
}

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
  const size = jpegSize(jpeg);
  return `${size ? `${size.width}x${size.height}` : '?x?'}/${Math.round(jpeg.length / 1024)}kb`;
}

function freshResult(at: number | undefined, now: number): boolean {
  return at !== undefined && now - at <= SECONDARY_FRESH_MS;
}

function newResult(at: number | undefined, carried: number | undefined, now: number): boolean {
  return at !== carried && freshResult(at, now);
}

function noteOccurrence(occurrences: [number, number][], now: number, startsNew: boolean): void {
  if (startsNew && occurrences.length < MAX_OCCURRENCES) occurrences.push([now, now]);
  else occurrences[occurrences.length - 1][1] = now;
}

function clipArea(clip: TrackedClipEmbedding): number {
  const box = clip.parentBox ?? clip.box;
  return box ? box.width * box.height : 0;
}

function faceBucket(face: TrackedFaceDetection, shared: number | undefined, epoch: number): string {
  if (face.parentTrackId !== undefined) return epoch > 0 ? `t${face.parentTrackId}:${epoch}` : `t${face.parentTrackId}`;
  if (shared !== undefined) return `s${shared}:${face.identity ?? ''}`;
  return `untracked:${face.identity ?? ''}`;
}

interface HeldAttribute {
  matched?: string;
  thumbnail?: Uint8Array;
  embedding?: number[];
  embeddingModel?: string;
  landmarks?: Point[];
  quality?: number;
  clipEmbedding?: number[];
  clipEmbeddingModel?: string;
}

interface HeldPerson {
  sum: number[];
  model: string;
}

interface ThumbnailCandidate {
  jpeg: Buffer;
  score: number;
  area: number;
  onEdge: boolean;
  hasAttribute: boolean;
}

interface ClipSlot {
  index: number;
  trackId?: number;
  area: number;
}

interface UncountedClip {
  clip: TrackedClipEmbedding;
  model: string;
}

interface FaceSlot {
  trackId?: number;
  sum?: number[];
  count: number;
  listed: boolean;
  together: Set<number>;
}

export class DetectionEventManager {
  private static readonly MAX_PLATE_THUMBNAILS = 16;
  private static readonly SEGMENT_LINGER_MS = 10_000;
  private static readonly VECTOR_PARK_MS = 2_000;
  private static readonly CLOSE_RECHECK_MS = 200;
  private static readonly CLOSE_WAIT_MAX_MS = 8_000;
  private static readonly PERSON_TRACKS_MAX = 256;
  private static readonly PRE_EVENT_READS_MAX = 32;
  private static readonly KEEPALIVE_MS = 5_000;

  private activeEvent: RecordedEvent | null = null;
  private activeSegment: RecordedSegment | null = null;
  private segmentTrackPaths = new Map<number, DetectionPath>();
  private segmentIndex = 0;
  private lastPublishTime = 0;

  private shippedSceneAt = 0;
  private attributeThumbnails = new Map<string, ThumbnailCandidate>();
  private heldAttributes: HeldAttribute[] = [];
  private shippedAttributes = new Map<number, Uint8Array>();
  private segmentMoment?: SegmentMoment;
  private pendingMoment?: SegmentMoment;
  private eventThumbnailAt = 0;
  private segmentClosePendingSince: number | null = null;
  private lingerTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private openVectorJobs = 0;
  private lastSegmentClosedAt = 0;
  private parkedVectors: { capturedAt: number; attach: () => void }[] = [];
  private preEventReads: TraceFaceRead[] = [];
  private faceMinConfidence = 0;

  private eventThumbnail: Buffer | null = null;
  private needsEventThumbnail = false;

  private segmentFaceTrackIds = new Map<string, number>();
  private segmentFaceSlots = new Map<number, FaceSlot>();
  private segmentPlateAttrIndex = new Map<string, number>();
  private segmentPlateReads = new Set<string>();
  private eventPlateVotes = new Map<string, PlateVoteTracker>();
  private plateVotingActive = true;
  private segmentClassifierTrackIds = new Map<string, number>();
  private segmentClipSlots = new Map<string, ClipSlot[]>();
  private segmentSeenApart = new Map<number, Set<number>>();
  private uncountedClips: UncountedClip[] = [];
  private countedAt = 0;
  private trackPersonVectors = new Map<number, HeldPerson>();
  private carriedFacesAt?: number;
  private carriedPlatesAt?: number;
  private carriedClassifiersAt?: number;
  private carriedCrossingsAt?: number;
  private heldSensorTriggers = new Set<string>();

  private readonly eventSubject: string;
  private readonly nvr: NvrSink;
  private readonly training: TrainingSink;
  private readonly trace = new EventTraceCollector();

  private onEventEndCallback?: () => void;
  private onSegmentClosedCallback?: () => void;

  constructor(
    private readonly cameraId: string,
    private readonly proxy: RPCClient,
    private readonly logger: LoggerService,
    private readonly perf?: PerfTracker,
  ) {
    const ns = NamespaceManager.detectionEventNamespaces(cameraId);
    this.eventSubject = ns.detectionEventSubject;
    this.nvr = new NvrSink(proxy, logger);
    this.training = new TrainingSink(cameraId, proxy, logger);
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
    // the tick cuts the moment before it opens the segment, hold it for the opening
    if (!this.activeSegment) {
      // within a tick the shots compete by rank, a newer tick always displaces the pending one
      if (this.beatsMoment(moment.rank, moment.score, moment.stream, this.incumbentMoment(moment.capturedAt))) {
        this.pendingMoment = moment;
      }
      this.recordMomentVerdict(moment, 'pending');
      return;
    }
    this.takeMoment(moment);
  }

  public wantsMoment(rank: number, score: number, stream: AnalysisStream, at: number): boolean {
    return this.beatsMoment(rank, score, stream, this.incumbentMoment(at));
  }

  public processResults(snapshot: ProcessedDetectionData): void {
    const data = this.freshResults(snapshot);
    const now = data.timestamp;
    this.training.observe(this.sceneObservations(data, now), now);
    const triggers = this.extractTriggers(data, now);
    const hasDetections = this.hasNewDetections(data);
    this.carriedFacesAt = data.facesAt;
    this.carriedPlatesAt = data.platesAt;
    this.carriedClassifiersAt = data.classifiersAt;
    this.carriedCrossingsAt = data.lineCrossings?.[0]?.timestamp;

    if (triggers.length === 0 && !this.activeEvent) return;

    if (!this.activeEvent) {
      if (triggers.length === 0) return;
      this.startEvent(triggers, data, now, hasDetections);
      if (data.trace) this.trace.add(data.trace);
      return;
    }

    if (data.trace) this.trace.add(data.trace);

    // publish now, not with the next throttled update
    if (data.eventThumbnail && this.needsEventThumbnail) {
      this.eventThumbnail = data.eventThumbnail;
      this.eventThumbnailAt = now;
      this.needsEventThumbnail = false;
      this.publishEventThumbnail();
    }

    if (data.trainingFrame) this.offerTrainingCandidate(data.trainingFrame, data, now);

    if (triggers.length > 0) {
      this.enrichTriggers(triggers, data, now);
      // a trigger joining mid-event stamps its type now, not with the next segment update
      this.updateTypes();
      this.activeEvent.lastUpdate = now;
      this.activeEvent.expectedEndTime = data.expectedEndTime;
      // keep-alive for the UI, with an active segment segment-update carries it
      if (!this.activeSegment) {
        this.publishUpdateThrottled();
      }
    }
    this.noteSensorHolds(data.heldSensorTriggers, now);

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
      // linger before closing: a reopening span continues this segment, timer-driven so tickless cameras close too
      this.segmentClosePendingSince = now;
      this.lingerTimer = setTimeout(() => this.closeLingeredSegment(Date.now()), DetectionEventManager.SEGMENT_LINGER_MS);
    }
  }

  public traceTick(trace: TraceTick): void {
    if (this.activeEvent) this.trace.add(trace);
  }

  public traceFaceReads(reads: TraceFaceRead[]): void {
    if (this.activeEvent) {
      this.trace.addReads(reads);
      return;
    }
    // the opening frame's reads can settle before its tick starts the event
    this.preEventReads.push(...reads);
    this.preEventReads.splice(0, this.preEventReads.length - DetectionEventManager.PRE_EVENT_READS_MAX);
  }

  public vectorJobStarted(): void {
    this.openVectorJobs++;
    if (this.perf) this.perf.vectorJobs++;
  }

  public vectorJobSettled(): void {
    this.openVectorJobs = Math.max(0, this.openVectorJobs - 1);
  }

  public acceptClipVectors(clips: TrackedClipEmbedding[], model: string, capturedAt: number): void {
    for (const clip of clips) {
      if (clip.embedding?.length) this.acceptVector(capturedAt, () => this.attachCountedClip(clip, model, capturedAt));
    }
  }

  public acceptFaceVectors(faces: TrackedFaceDetection[], model: string, capturedAt: number): void {
    const together: number[] = [];
    for (const face of faces) {
      if (face.embedding?.length) this.acceptVector(capturedAt, () => this.attachFace(face, model, together));
    }
  }

  public acceptPersonVectors(persons: TrackedPersonEmbedding[], model: string, capturedAt: number): void {
    for (const person of persons) {
      if (person.embedding.length) this.acceptVector(capturedAt, () => this.attachPerson(person, model));
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
    this.training.destroy();
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

  public wantsTrainingFrame(subjects: TrainingSubject[] = []): boolean {
    return this.training.wantsFrame(this.activeEvent?.id, subjects);
  }

  public hasActiveEvent(): boolean {
    return this.activeEvent !== null;
  }

  private acceptVector(capturedAt: number, attach: () => void): void {
    if (capturedAt < this.lastSegmentClosedAt) {
      if (this.perf) this.perf.vectorsDropped++;
      return;
    }
    if (!this.activeSegment) {
      this.dropStaleParkedVectors(Date.now());
      this.parkedVectors.push({ capturedAt, attach });
      if (this.perf) this.perf.vectorsParked++;
      return;
    }
    attach();
    if (this.perf) this.perf.vectorsAccepted++;
  }

  private closeLingeredSegment(dueAt: number): void {
    this.lingerTimer = null;
    if (this.segmentClosePendingSince === null) return;

    const waited = Date.now() - dueAt;
    if (this.openVectorJobs > 0 && waited < DetectionEventManager.CLOSE_WAIT_MAX_MS) {
      this.lingerTimer = setTimeout(() => this.closeLingeredSegment(dueAt), DetectionEventManager.CLOSE_RECHECK_MS);
      return;
    }
    if (waited >= DetectionEventManager.CLOSE_RECHECK_MS && this.perf) {
      this.perf.closeDelays++;
      this.perf.closeDelayMs += waited;
    }

    this.segmentClosePendingSince = null;
    this.closeSegment();
    this.onSegmentClosedCallback?.();
  }

  private startEvent(triggers: EventTrigger[], data: ProcessedDetectionData, now: number, hasDetections: boolean): void {
    this.trace.reset(now);
    this.trace.addReads(this.preEventReads);
    this.preEventReads = [];
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
    this.heldSensorTriggers = new Set(data.heldSensorTriggers);
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

    // without a pre-captured scene the next coordinator tick delivers it via update
    if (this.eventThumbnail) {
      this.activeEvent.thumbnailAt = this.eventThumbnailAt || undefined;
    }
    this.publish('start', this.eventThumbnail ? { scene: this.eventThumbnail } : undefined);
    clearInterval(this.keepAliveTimer ?? undefined);
    this.keepAliveTimer = setInterval(() => this.keepAlive(), DetectionEventManager.KEEPALIVE_MS);
    if (data.trainingFrame) this.offerTrainingCandidate(data.trainingFrame, data, now);

    const triggerTypes = [...new Set(triggers.map((t) => t.type))].join(',');
    const thumbInfo = this.eventThumbnail ? jpegInfo(this.eventThumbnail) : 'pending';
    this.logger.log(`[event] start id=${this.activeEvent.id.slice(0, 8)} triggers=[${triggerTypes}] types=[${this.activeEvent.types.join(',')}] thumb=${thumbInfo}`);

    if (hasDetections && data.hasOpenSpans) {
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

    // ticks after the last segment closed, linger or motion without objects
    const trace = this.trace.take(true);
    this.publish('end', trace ? { trace } : undefined);

    const duration = this.activeEvent.endTime - this.activeEvent.startTime;
    this.logger.log(`[event] end id=${this.activeEvent.id.slice(0, 8)} duration=${duration}ms segments=${this.segmentIndex} types=[${this.activeEvent.types.join(',')}]`);
    this.training.flushNow();

    this.activeEvent = null;
    this.activeSegment = null;
    this.segmentClosePendingSince = null;
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = null;
    }
    clearInterval(this.keepAliveTimer ?? undefined);
    this.keepAliveTimer = null;
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

    // both carry the tick's stamp, an older pending moment belongs to a tick that opened nothing
    const pending = this.pendingMoment;
    this.pendingMoment = undefined;
    if (pending?.capturedAt === now) {
      this.takeMoment(pending);
    }

    if (data.thumbnails && data.thumbnails.length > 0) {
      this.updateThumbnails(data.thumbnails);
    }

    this.attachParkedVectors(now);
    this.activeEvent.lastUpdate = now;
    this.updateTypes();
    this.publishSegment('segment-start');
  }

  private dropStaleParkedVectors(now: number): void {
    const fresh = this.parkedVectors.filter((parked) => now - parked.capturedAt <= DetectionEventManager.VECTOR_PARK_MS);
    if (this.perf) this.perf.vectorsDropped += this.parkedVectors.length - fresh.length;
    this.parkedVectors = fresh;
  }

  private attachParkedVectors(now: number): void {
    this.dropStaleParkedVectors(now);
    const parked = this.parkedVectors;
    this.parkedVectors = [];
    for (const { capturedAt, attach } of parked) {
      if (capturedAt >= this.lastSegmentClosedAt) {
        attach();
        if (this.perf) this.perf.vectorsAccepted++;
      } else if (this.perf) {
        this.perf.vectorsDropped++;
      }
    }
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

    // lastSeen stays on the last real detection, the linger is not part of what was seen
    this.attachUncountedClips();
    this.flushPlateFallbacks();
    this.publishSegment('segment-end');
    this.clearSegmentThumbnails();
    this.training.flushNow();

    this.segmentIndex++;
    this.activeSegment = null;
    this.lastSegmentClosedAt = Date.now();
  }

  private enrichTriggers(triggers: EventTrigger[], data: ProcessedDetectionData, now: number): void {
    if (!this.activeEvent) return;

    for (const incoming of triggers) {
      const existing = this.activeEvent.triggers.find((t) => t.type === incoming.type && t.label === incoming.label && t.lineName === incoming.lineName);

      if (existing) {
        const occurrences = existing.occurrences;
        if (occurrences && existing.type === 'line-crossing') {
          // a crossing is a point, two in one frame are one
          noteOccurrence(occurrences, now, now > occurrences[occurrences.length - 1][1]);
        } else if (occurrences && !data.sensorTriggers?.includes(existing.type)) {
          noteOccurrence(occurrences, now, now - occurrences[occurrences.length - 1][1] > OCCURRENCE_GAP_MS);
        } else if (occurrences && existing.type === data.startedSensorTrigger) {
          // a sensor starts and ends its own occurrence, the dwell after its end only keeps the event going
          noteOccurrence(occurrences, now, true);
        }
        existing.lastSeen = now;
        if (incoming.score !== undefined && (existing.score === undefined || incoming.score > existing.score)) {
          existing.score = incoming.score;
        }
      } else {
        this.activeEvent.triggers.push({ ...incoming });
      }
    }
  }

  // a held sensor's occurrence grows until the first snapshot that no longer holds it
  private noteSensorHolds(held: string[] | undefined, now: number): void {
    if (!this.activeEvent) return;

    const next = new Set(held);
    for (const type of new Set([...this.heldSensorTriggers, ...next])) {
      const occurrences = this.activeEvent.triggers.find((t) => t.type === type)?.occurrences;
      if (occurrences) occurrences[occurrences.length - 1][1] = now;
    }
    this.heldSensorTriggers = next;
  }

  private enrichSegment(data: ProcessedDetectionData, now: number): void {
    if (!this.activeSegment) return;

    this.activeSegment.lastSeen = now;
    this.noteSeenApart([...data.objects, ...(data.staticObjects ?? [])]);

    if (data.objects.length > 0) {
      const labelCounts = new Map<
        string,
        { count: number; bestScore: number; bestBox?: BoundingBox; bestTrackId?: number; moving?: boolean; anyMoving: boolean; presentSince?: number }
      >();
      for (const obj of data.objects) {
        const t = obj as { trackId?: number; trackSpeed?: number; presentSince?: number; label: string; confidence: number; box: BoundingBox };
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
        const moving = t.trackSpeed !== undefined ? isMovingTrack(t) : undefined;
        const entry = labelCounts.get(obj.label);
        if (entry) {
          entry.count++;
          if (moving === true) entry.anyMoving = true;
          if (t.presentSince !== undefined) entry.presentSince = Math.min(entry.presentSince ?? t.presentSince, t.presentSince);
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
            presentSince: t.presentSince,
          });
        }
      }

      for (const [label, { count, bestScore, bestBox, bestTrackId, moving, anyMoving, presentSince }] of labelCounts) {
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
          if (presentSince !== undefined) {
            existing.presentSince = Math.min(existing.presentSince ?? presentSince, presentSince);
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
            presentSince,
          });
        }
      }

      for (const d of this.activeSegment.detections) {
        if (d.trackId === undefined) continue;
        const path = this.segmentTrackPaths.get(d.trackId);
        if (path) d.path = path;
      }

      // per label: an alert zone gates pushes per label, a car in the driveway must not vouch for the person on the road
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

    this.faceMinConfidence = data.faceMinConfidence ?? 0;
    const together: number[] = [];
    for (const face of data.faces) this.attachFace(face, data.faceEmbeddingModel, together);

    this.plateVotingActive = data.plateVoting !== false;

    for (const plate of data.plates) {
      if (!plate.plateText) continue;

      if (!this.plateVotingActive) {
        // the camera already vetted an external read, keep it as is
        const label = normalizePlateText(plate.plateText) || plate.plateText;
        const existing = this.activeSegment.attributes.find((a) => a.type === 'license_plate' && a.label === label);
        if (existing) {
          if (plate.confidence > (existing.confidence ?? 0)) existing.confidence = plate.confidence;
        } else {
          this.pushAttribute({ type: 'license_plate', label, confidence: plate.confidence, parentTrackId: plate.parentTrackId });
        }
        continue;
      }

      // illegible reads never become candidates, plugins without ocrConfidence pass
      if (plate.ocrConfidence !== undefined && plate.ocrConfidence < (data.plateMinConfidence ?? 0)) continue;

      // vote per vehicle so flickering OCR converges on one plate, the untracked bucket may yield several
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
      if (clip.embedding?.length) this.attachClip(clip, data.clipEmbeddingModel);
    }

    this.countedAt = Date.now();
    this.attachUncountedClips();
  }

  private attachFace(face: TrackedFaceDetection, model: string | undefined, together?: number[]): void {
    if (!this.activeSegment || face.confidence < this.faceMinConfidence) return;
    if (!face.identity && !face.embedding?.length) return;

    // one face per track; untracked faces share a slot per name, and a name a tracked face carries is that person
    const tracked = face.parentTrackId !== undefined;
    const note = faceNote(face);
    const shared = note?.shared;
    const carriesName = (a: RecordedAttribute) => a.type === 'face' && a.label === face.identity && (shared === undefined || a.parentTrackId === shared);
    const bucket = faceBucket(face, shared, note?.epoch ?? 0);
    const index = this.segmentFaceTrackIds.get(bucket);
    // a face of two in one box keeps taking sharper reads into its own slot
    const ownSlot = shared !== undefined && index !== undefined;
    if (!tracked && !ownSlot && face.identity && this.activeSegment.attributes.some(carriesName)) return;
    if (index === undefined) {
      const slotIndex = this.activeSegment.attributes.length;
      this.segmentFaceTrackIds.set(bucket, slotIndex);
      const parentTrackId = face.parentTrackId ?? shared;
      this.pushAttribute({ type: 'face', label: face.identity ?? 'unknown', confidence: face.confidence, parentTrackId, unlisted: true }, this.heldFace(face, model));
      this.noteFaceSlot(slotIndex, face, together);
      return;
    }

    const existing = this.activeSegment.attributes[index];
    if (!existing) return;
    // a track's slot carries the name the track settled on last, a vector may also take it back
    if (tracked && (face.identity || face.embedding?.length)) existing.label = face.identity ?? 'unknown';
    else if (face.identity && existing.label === 'unknown') existing.label = face.identity;
    this.noteFaceSlot(index, face, together);
    if (!this.betterFace(face, existing, this.heldAttributes[index])) return;
    existing.confidence = face.confidence;
    this.heldAttributes[index] = this.heldFace(face, model);
  }

  private noteFaceSlot(index: number, face: TrackedFaceDetection, together: number[] | undefined): void {
    const attributes = this.activeSegment?.attributes;
    if (!attributes?.[index]) return;
    let slot = this.segmentFaceSlots.get(index);
    if (!slot) {
      slot = { trackId: attributes[index].parentTrackId, count: 0, listed: false, together: new Set() };
      this.segmentFaceSlots.set(index, slot);
    }
    if (face.embedding?.length && (!slot.sum || slot.sum.length === face.embedding.length)) {
      const vector = unitVector(face.embedding);
      slot.sum = slot.sum ? slot.sum.map((value, i) => value + vector[i]) : vector;
      slot.count++;
    }
    if (together) {
      for (const other of together) {
        if (other === index) continue;
        slot.together.add(other);
        this.segmentFaceSlots.get(other)?.together.add(index);
      }
      if (!together.includes(index)) together.push(index);
    }
    this.listFaceSlots();
  }

  private listFaceSlots(): void {
    const attributes = this.activeSegment?.attributes;
    if (!attributes) return;
    const listed = [...this.segmentFaceSlots].filter(([, slot]) => slot.listed);
    for (const [index, slot] of this.segmentFaceSlots) {
      if (slot.listed) continue;
      const label = attributes[index]?.label;
      const newName = label !== undefined && label !== 'unknown' && !listed.some(([other]) => attributes[other]?.label === label);
      if (!newName && !listed.every(([other, otherSlot]) => this.distinctFaces(slot, other, otherSlot))) continue;
      slot.listed = true;
      delete attributes[index].unlisted;
      listed.push([index, slot]);
    }
  }

  private distinctFaces(slot: FaceSlot, other: number, otherSlot: FaceSlot): boolean {
    if (slot.together.has(other)) return true;
    if (slot.trackId !== undefined && otherSlot.trackId !== undefined && this.segmentSeenApart.get(slot.trackId)?.has(otherSlot.trackId)) return true;
    if (!slot.sum || slot.sum.length !== otherSlot.sum?.length) return false;
    return slot.count >= FACE_MEAN_MIN_FACES && otherSlot.count >= FACE_MEAN_MIN_FACES && cosine(slot.sum, otherSlot.sum) < FACE_MEANS_APART;
  }

  private betterFace(face: TrackedFaceDetection, existing: RecordedAttribute, held: HeldAttribute | undefined): boolean {
    // picture, vector and points travel as one sighting, the sharpest face fitting the name wins
    const fits = (matched?: string) => (matched ?? 'unknown') === existing.label;
    if (fits(face.matched) !== fits(held?.matched)) return fits(face.matched);
    const hasVector = Boolean(face.embedding?.length);
    if (hasVector !== Boolean(held?.embedding?.length)) return hasVector;
    if (Boolean(face.thumbnail) !== Boolean(held?.thumbnail)) return Boolean(face.thumbnail);
    return face.quality !== undefined && held?.quality !== undefined ? face.quality > held.quality : face.confidence > (existing.confidence ?? 0);
  }

  private attachCountedClip(clip: TrackedClipEmbedding, model: string, capturedAt: number): void {
    // the vector can be back before its own tick's objects reached the segment counts
    if (capturedAt > this.countedAt) {
      this.uncountedClips.push({ clip, model });
      return;
    }
    this.attachClip(clip, model);
  }

  private attachUncountedClips(): void {
    const uncounted = this.uncountedClips;
    this.uncountedClips = [];
    for (const { clip, model } of uncounted) this.attachClip(clip, model);
  }

  private attachClip(clip: TrackedClipEmbedding, model: string | undefined): void {
    if (!this.activeSegment) return;
    const held: HeldAttribute = { clipEmbedding: clip.embedding, clipEmbeddingModel: model };
    const area = clipArea(clip);
    const slots = this.segmentClipSlots.get(clip.label) ?? [];
    const own = clip.parentTrackId === undefined ? undefined : slots.find((slot) => slot.trackId === clip.parentTrackId);
    if (own) {
      // an edge-cut box is someone walking in or out, often with another person in it
      if (clip.onEdge || area < own.area * CLIP_VIEW_GROWTH) return;
      own.area = area;
      this.heldAttributes[own.index] = held;
      return;
    }

    // one embedding per subject, a re-numbered track is still the same person
    const trackId = clip.parentTrackId;
    const present = this.activeSegment.detections.find((d) => d.label === clip.label)?.maxCount ?? 1;
    const apart = trackId !== undefined && slots.every((slot) => slot.trackId !== undefined && this.segmentSeenApart.get(slot.trackId)?.has(trackId));
    if (slots.length >= Math.max(1, present) && !apart) return;
    slots.push({ index: this.activeSegment.attributes.length, trackId: clip.parentTrackId, area });
    this.segmentClipSlots.set(clip.label, slots);
    this.pushAttribute({ type: 'clip', label: clip.label, parentTrackId: clip.parentTrackId }, held);
  }

  private noteSeenApart(objects: Detection[]): void {
    for (const a of objects) {
      const id = (a as { trackId?: number }).trackId;
      if (id === undefined) continue;
      for (const b of objects) {
        const other = (b as { trackId?: number }).trackId;
        if (other === undefined || other === id || iou(a.box, b.box) >= OBJECT_MERGE_IOU_THRESHOLD) continue;
        const apart = this.segmentSeenApart.get(id) ?? new Set<number>();
        apart.add(other);
        this.segmentSeenApart.set(id, apart);
      }
    }
  }

  private attachPerson(person: TrackedPersonEmbedding, model: string): void {
    const held = this.trackPersonVectors.get(person.trackId);
    this.trackPersonVectors.delete(person.trackId);
    if (held?.model === model && held.sum.length === person.embedding.length) {
      for (let i = 0; i < held.sum.length; i++) held.sum[i] += person.embedding[i];
      this.trackPersonVectors.set(person.trackId, held);
    } else {
      this.trackPersonVectors.set(person.trackId, { sum: [...person.embedding], model });
    }
    if (this.trackPersonVectors.size > DetectionEventManager.PERSON_TRACKS_MAX) {
      this.trackPersonVectors.delete(this.trackPersonVectors.keys().next().value!);
    }
  }

  private segmentPersonEmbeddings(): RecordedPersonEmbedding[] | undefined {
    const embeddings: RecordedPersonEmbedding[] = [];
    for (const trackId of this.segmentTrackPaths.keys()) {
      const held = this.trackPersonVectors.get(trackId);
      if (held) embeddings.push({ trackId, embedding: unitVector(held.sum), embeddingModel: held.model });
    }
    return embeddings.length ? embeddings : undefined;
  }

  private heldFace(face: TrackedFaceDetection, embeddingModel?: string): HeldAttribute {
    return { thumbnail: face.thumbnail, embedding: face.embedding, embeddingModel, landmarks: face.thumbnailLandmarks, quality: face.quality, matched: face.matched };
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
      // external motion without a specific sensor trigger
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

    // the coordinator repeats the last crossings until the cascade ends, each one counts once
    if (data.lineCrossings?.length && data.lineCrossings[0].timestamp !== this.carriedCrossingsAt) {
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

    for (const trigger of triggers) trigger.occurrences = [[now, now]];
    return triggers;
  }

  private updateTypes(): void {
    if (!this.activeEvent) return;

    const types = new Set<string>(this.activeEvent.types);

    for (const t of this.activeEvent.triggers) types.add(t.type);
    // segments only fill in publishSegment, the active one carries the current types
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

  private freshResults(data: ProcessedDetectionData): ProcessedDetectionData {
    const staleClassifiers = data.classifiers.length > 0 && !freshResult(data.classifiersAt, data.timestamp);
    const staleClips = data.clips.length > 0 && !freshResult(data.clipsAt, data.timestamp);
    if (!staleClassifiers && !staleClips) return data;
    return { ...data, classifiers: staleClassifiers ? [] : data.classifiers, clips: staleClips ? [] : data.clips };
  }

  private hasNewDetections(data: ProcessedDetectionData): boolean {
    if (data.objects.length > 0) return true;
    if (data.classifiers.length > 0 && newResult(data.classifiersAt, this.carriedClassifiersAt, data.timestamp)) return true;
    if (data.faces.length > 0 && newResult(data.facesAt, this.carriedFacesAt, data.timestamp)) return true;
    return data.plates.length > 0 && newResult(data.platesAt, this.carriedPlatesAt, data.timestamp);
  }

  private updateThumbnails(thumbnails: DetectionThumbnail[]): void {
    for (const thumb of thumbnails) {
      const label = thumb.label;
      // faces hold their own picture per track
      if (!label.startsWith('plate:') && !label.startsWith('class:')) continue;
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
    };

    if (!current) {
      map.set(key, candidate);
      return;
    }

    if (!candidate.onEdge && (candidate.area > current.area || candidate.score > current.score)) {
      map.set(key, candidate);
    }
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
    // the face points travel with their picture, never on a later message
    const landmarks: (Point[] | undefined)[] = [];
    let anyCrop = false;

    for (const [index, attribute] of attributes.entries()) {
      const held = this.heldAttributes[index];
      // an unlisted face ships its picture only once it shows to be someone else
      const crop = attribute.unlisted ? undefined : (held?.thumbnail ?? this.attributeThumbnailFor(attribute));

      if (crop?.length && this.shippedAttributes.get(index) !== crop) {
        this.shippedAttributes.set(index, crop);
        crops.push(crop);
        landmarks.push(crop === held?.thumbnail ? held.landmarks : undefined);
        anyCrop = true;
      } else {
        crops.push(undefined);
        landmarks.push(undefined);
      }

      // the face and clip indexes read the embeddings once, when the segment closes
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

    if (withEmbeddings && this.activeSegment) this.activeSegment.personEmbeddings = this.segmentPersonEmbeddings();

    if (anyCrop) {
      attachments.attributes = crops;
      if (landmarks.some((points) => points?.length)) attachments.attributeLandmarks = landmarks;
    }
    return attachments;
  }

  private attributeThumbnailFor(attribute: RecordedAttribute): Buffer | undefined {
    // the best picture of a name may show someone else who carries it
    if (attribute.type === 'face') return undefined;
    const keys = [`plate:${attribute.label}`, `class:${attribute.label}`];
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
      this.recordMomentVerdict(moment, 'rejected');
      return;
    }
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
    // the score is normalized, a main-stream crop of the same framing only has to tie
    if (stream === 'main' && held.stream === 'low') return score > held.score;
    return score > held.score * MOMENT_IMPROVEMENT;
  }

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
    this.heldAttributes = [];
    this.shippedAttributes.clear();
    this.segmentFaceTrackIds.clear();
    this.segmentFaceSlots.clear();
    this.segmentPlateAttrIndex.clear();
    this.segmentPlateReads.clear();
    this.segmentClassifierTrackIds.clear();
    this.segmentClipSlots.clear();
    this.segmentSeenApart.clear();
  }

  private offerTrainingCandidate(scene: Buffer, data: ProcessedDetectionData, capturedAt: number): void {
    if (!this.activeEvent) return;
    const boxes: TrainingCandidateBox[] = [];
    const add = (items: { label: string; confidence: number; box?: BoundingBox }[], source: TrainingBoxSource, label?: string) => {
      for (const item of items) {
        if (!item.box || isFullFrameBox(item.box)) continue;
        const { x, y, width, height } = item.box;
        boxes.push({ label: label ?? item.label, x, y, width, height, source, score: item.confidence });
      }
    };
    add(data.objects, 'object');
    if (data.facesAt !== undefined && capturedAt - data.facesAt <= SECONDARY_FRESH_MS) add(data.faces, 'face', 'face');
    if (data.platesAt !== undefined && capturedAt - data.platesAt <= SECONDARY_FRESH_MS) add(data.plates, 'plate', 'license_plate');
    // static tracks ride along, an unlabeled parked object would teach "background"
    add(data.staticObjects ?? [], 'static');
    // so do sightings the event pipeline dropped, they are in the picture all the same
    add(data.trainingExtras ?? [], 'extra');
    add(data.trainingSuggestions ?? [], 'suggestion');
    this.training.consider(this.activeEvent.id, scene, boxes, capturedAt, data.trainingSubjects ?? [], data.trainingDetector);
  }

  private sceneObservations(data: ProcessedDetectionData, now: number): SceneObservation[] {
    const seen: SceneObservation[] = [];
    for (const o of data.objects) {
      if (o.box && !isFullFrameBox(o.box)) seen.push({ label: o.label, box: o.box });
    }
    for (const still of data.staticObjects ?? []) {
      if (still.box && !isFullFrameBox(still.box)) seen.push({ label: still.label, box: still.box });
    }
    for (const extra of data.trainingExtras ?? []) {
      if (extra.box && !isFullFrameBox(extra.box)) seen.push({ label: extra.label, box: extra.box });
    }
    if (data.facesAt !== undefined && now - data.facesAt <= SECONDARY_FRESH_MS) {
      for (const face of data.faces) {
        if (face.box && !isFullFrameBox(face.box)) seen.push({ label: 'face', box: face.box });
      }
    }
    if (data.platesAt !== undefined && now - data.platesAt <= SECONDARY_FRESH_MS) {
      for (const plate of data.plates) {
        if (plate.box && !isFullFrameBox(plate.box)) seen.push({ label: 'license_plate', box: plate.box });
      }
    }
    return seen;
  }

  private publish(type: DetectionEventType, attachments?: EventAttachments): void {
    if (!this.activeEvent) return;
    const message: DetectionEventMessage = { type, data: leanEvent(this.activeEvent) };
    this.proxy.publish(this.eventSubject, message);
    this.nvr.send(type, this.activeEvent, attachments);
    this.recordMessage(type, attachments);
    this.lastPublishTime = Date.now();
  }

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
      attributes: attributes.map((a) => ({ type: a.type, label: a.label, confidence: a.confidence, parent: a.parentTrackId, unlisted: a.unlisted })),
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
    if (moment) {
      this.activeSegment.thumbnailAt = moment.shownAt ?? moment.capturedAt;
      this.activeSegment.stripWindow = moment.stripWindow;
      this.activeSegment.cardWindow = moment.cardWindow;
    }

    const attachments = this.segmentAttachments(type === 'segment-end');
    // ticks ride every segment message, a crash costs a second of trace, not the segment
    if (type !== 'segment-start') attachments.trace = this.trace.take();
    this.publish(type, attachments);
  }

  private publishSegmentThrottled(type: 'segment-update'): void {
    const now = Date.now();
    if (now - this.lastPublishTime >= UPDATE_THROTTLE_MS) {
      this.publishSegment(type);
    }
  }

  private keepAlive(): void {
    if (!this.activeEvent || Date.now() - this.lastPublishTime < DetectionEventManager.KEEPALIVE_MS) return;
    // the recorder ends an event a new decoder does not mention, so a quiet segment still publishes
    if (this.activeSegment) {
      this.publishSegment('segment-update');
      return;
    }
    this.activeEvent.segments = [];
    const trace = this.trace.take();
    this.publish('update', trace ? { trace } : undefined);
  }

  private publishUpdateThrottled(): void {
    const now = Date.now();
    if (now - this.lastPublishTime >= UPDATE_THROTTLE_MS) {
      this.activeEvent!.segments = [];
      // outside a segment the ticks ride the keep-alive, or a segmentless event stores its trace only at the end
      const trace = this.trace.take();
      this.publish('update', trace ? { trace } : undefined);
    }
  }

  private logSegment(type: 'segment-start' | 'segment-update' | 'segment-end'): void {
    if (!this.activeEvent || !this.activeSegment) return;

    const seg = this.activeSegment;
    const parts: string[] = [`[event] ${type}`, `id=${this.activeEvent.id.slice(0, 8)}`, `seg=${this.segmentIndex}`];

    if (type === 'segment-end') {
      parts.push(`duration=${seg.lastSeen - seg.firstSeen}ms`);
    }

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
