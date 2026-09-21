/* eslint-disable @stylistic/max-len */
import { detectionRecord } from './debug/detection-record.js';

import type { Logger } from '@camera.ui/common/logger';
import type { DetectorTiming, FrameWorkerPerfCounters, FrameWorkerPerfSnapshot } from './types.js';

const REPORT_MS = 60_000;

export class PerfTracker {
  public loopMs = 0;
  public idleTicks = 0;
  public activeTicks = 0;
  public mainTicks = 0;
  public mainLoopMs = 0;
  public switches = 0;
  public decodeMs = 0;
  public decodedFrames = 0;
  public mainDecodeMs = 0;
  public mainDecodedFrames = 0;
  public scaleMs = 0;
  public motionScaleMs = 0;
  public motionScaleCount = 0;
  public postMs = 0;
  public jpegMs = 0;
  public motionMs = 0;
  public motionCount = 0;
  public objectMs = 0;
  public objectCount = 0;
  public assistMs = 0;
  public assistCount = 0;
  public faceMs = 0;
  public faceCount = 0;
  public plateMs = 0;
  public plateCount = 0;
  public clipMs = 0;
  public clipCount = 0;
  public faceEmbedMs = 0;
  public faceEmbedCount = 0;
  public classifierMs = 0;
  public classifierCount = 0;
  public secondaryMs = 0;
  public objects = 0;
  public faces = 0;
  public plates = 0;
  public framesWithObjects = 0;
  public objectWorkMs = 0;
  public objectLoopMs = 0;
  public vectorJobs = 0;
  public vectorsAccepted = 0;
  public vectorsParked = 0;
  public vectorsDropped = 0;
  public closeDelays = 0;
  public closeDelayMs = 0;
  public zoomTicks = 0;
  public zoomWindows = 0;

  // stamped by the plugin itself, per sensor type: the wall-clock counters above
  // still hold the whole round trip
  public readonly detectors = new Map<string, DetectorTiming>();

  private readonly enabled = Boolean(process.env.CAMERA_UI_DEBUG_DIR);
  private cpu = process.cpuUsage();
  private since = 0;
  private startedAt = Date.now();
  private reportBase = this.counters();

  public snapshot(): Omit<FrameWorkerPerfSnapshot, 'mainStreamEnabled' | 'frameAnalysis' | 'detectors'> & { timings: Record<string, DetectorTiming> } {
    return {
      uptimeMs: Date.now() - this.startedAt,
      ticks: this.idleTicks + this.activeTicks,
      timings: Object.fromEntries(this.detectors),
      ...this.counters(),
    };
  }

  public trackTiming(sensorType: string, handlerMs: number, transportMs: number): void {
    const entry = this.detectors.get(sensorType) ?? { handlerMs: 0, transportMs: 0, calls: 0 };
    entry.handlerMs += handlerMs;
    entry.transportMs += transportMs;
    entry.calls++;
    this.detectors.set(sensorType, entry);
  }

  public reset(): void {
    for (const key of Object.keys(this.counters()) as (keyof FrameWorkerPerfCounters)[]) {
      this[key] = 0;
    }
    this.detectors.clear();
    this.startedAt = Date.now();
    this.since = Date.now();
    this.cpu = process.cpuUsage();
    this.reportBase = this.counters();
  }

  public report(logger: Logger): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (this.since === 0) {
      this.since = now;
      return;
    }

    const elapsed = now - this.since;
    if (elapsed < REPORT_MS) return;

    const delta = this.diff(this.reportBase);
    const { loopMs, idleTicks, activeTicks, switches, decodeMs, scaleMs, postMs, jpegMs, motionMs, objectMs, assistMs, secondaryMs, objects, faces, plates } = delta;
    const ticks = idleTicks + activeTicks;
    if (ticks > 0) {
      const cpu = process.cpuUsage(this.cpu);
      const cpuMs = Math.round((cpu.user + cpu.system) / 1000);
      const mem = process.memoryUsage();
      const rssMb = Math.round(mem.rss / 1024 / 1024);
      const externalMb = Math.round(mem.external / 1024 / 1024);
      const rate = loopMs > 0 ? (ticks / (loopMs / 1000)).toFixed(1) : '0';
      const activePct = Math.round((activeTicks / ticks) * 100);
      const shape = `${Math.round(elapsed / 1000)}s loop=${Math.round(loopMs / 1000)}s ticks=${ticks} (${rate}/s) active=${activePct}% switches=${switches}`;
      const cost = `cpu=${cpuMs}ms decode=${decodeMs}ms scale=${scaleMs}ms post=${postMs}ms jpeg=${jpegMs}ms motion=${motionMs}ms object=${objectMs}ms assist=${assistMs}ms secondary=${secondaryMs}ms`;
      const found = `rss=${rssMb}MB ext=${externalMb}MB obj=${objects} face=${faces} plate=${plates}`;
      logger.debug(`[perf] ${shape} ${cost} ${found}`);
      detectionRecord.perf({ ...delta, elapsedMs: elapsed, cpuMs, rssMb, externalMb });
    }

    this.cpu = process.cpuUsage();
    this.since = now;
    this.reportBase = this.counters();
  }

  private counters(): FrameWorkerPerfCounters {
    return {
      loopMs: this.loopMs,
      idleTicks: this.idleTicks,
      activeTicks: this.activeTicks,
      mainTicks: this.mainTicks,
      mainLoopMs: this.mainLoopMs,
      switches: this.switches,
      decodeMs: this.decodeMs,
      decodedFrames: this.decodedFrames,
      mainDecodeMs: this.mainDecodeMs,
      mainDecodedFrames: this.mainDecodedFrames,
      scaleMs: this.scaleMs,
      motionScaleMs: this.motionScaleMs,
      motionScaleCount: this.motionScaleCount,
      postMs: this.postMs,
      jpegMs: this.jpegMs,
      motionMs: this.motionMs,
      motionCount: this.motionCount,
      objectMs: this.objectMs,
      objectCount: this.objectCount,
      assistMs: this.assistMs,
      assistCount: this.assistCount,
      faceMs: this.faceMs,
      faceCount: this.faceCount,
      plateMs: this.plateMs,
      plateCount: this.plateCount,
      clipMs: this.clipMs,
      clipCount: this.clipCount,
      faceEmbedMs: this.faceEmbedMs,
      faceEmbedCount: this.faceEmbedCount,
      classifierMs: this.classifierMs,
      classifierCount: this.classifierCount,
      zoomTicks: this.zoomTicks,
      zoomWindows: this.zoomWindows,
      secondaryMs: this.secondaryMs,
      objects: this.objects,
      faces: this.faces,
      plates: this.plates,
      framesWithObjects: this.framesWithObjects,
      objectWorkMs: this.objectWorkMs,
      objectLoopMs: this.objectLoopMs,
      vectorJobs: this.vectorJobs,
      vectorsAccepted: this.vectorsAccepted,
      vectorsParked: this.vectorsParked,
      vectorsDropped: this.vectorsDropped,
      closeDelays: this.closeDelays,
      closeDelayMs: this.closeDelayMs,
    };
  }

  private diff(base: FrameWorkerPerfCounters): FrameWorkerPerfCounters {
    const current = this.counters();
    const out = {} as FrameWorkerPerfCounters;
    for (const key of Object.keys(current) as (keyof FrameWorkerPerfCounters)[]) {
      out[key] = current[key] - base[key];
    }
    return out;
  }
}
