import type { FrameWorkerPerfSnapshot } from '../../../camera/decoder/types.js';
import type { WorkerDetectorStats, WorkerPerfStats } from '../types.js';

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function per(total: number, count: number): number {
  return count > 0 ? round(total / count) : 0;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

export function deriveWorkerPerf(snapshot: FrameWorkerPerfSnapshot, pluginName: (pluginId: string) => string | undefined): WorkerPerfStats {
  const objectFrames = snapshot.objectCount;
  const judgedFrames = snapshot.objectCount + snapshot.assistCount;
  const fallback: Partial<Record<string, number>> = {
    motion: per(snapshot.motionMs, snapshot.motionCount),
    object: per(snapshot.objectMs, snapshot.objectCount),
    face: per(snapshot.faceMs, snapshot.faceCount),
    licensePlate: per(snapshot.plateMs, snapshot.plateCount),
    classifier: per(snapshot.classifierMs, snapshot.classifierCount),
    clip: per(snapshot.clipMs, snapshot.clipCount),
    faceEmbedder: per(snapshot.faceEmbedMs, snapshot.faceEmbedCount),
  };

  const detectors: Record<string, WorkerDetectorStats> = {};
  for (const [type, info] of Object.entries(snapshot.detectors)) {
    detectors[type] = {
      plugin: pluginName(info.plugin) ?? info.plugin,
      input: info.input,
      runtime: info.runtime,
      models: info.models,
      inferenceMs: info.calls ? per(info.handlerMs ?? 0, info.calls) : (fallback[type] ?? 0),
      transportMs: info.calls ? per(info.transportMs ?? 0, info.calls) : 0,
      stamped: Boolean(info.calls),
    };
  }

  const scaleMs = per(snapshot.scaleMs, objectFrames);
  const postMs = per(snapshot.postMs, objectFrames);
  const motionScaleMs = per(snapshot.motionScaleMs, snapshot.motionScaleCount);

  return {
    detectors,
    processingMs: objectFrames > 0 ? round(scaleMs + postMs) : motionScaleMs,
    decodeMs: per(snapshot.decodeMs, snapshot.decodedFrames),
    mainDecodeMs: per(snapshot.mainDecodeMs, snapshot.mainDecodedFrames),
    scaleMs,
    postMs,
    motionScaleMs,
    transportMs: detectors.object?.transportMs ?? 0,
    analysedFps: snapshot.loopMs > 0 ? round(snapshot.ticks / (snapshot.loopMs / 1000)) : 0,
    mainFps: snapshot.mainLoopMs > 0 ? round(snapshot.mainTicks / (snapshot.mainLoopMs / 1000)) : 0,
    mainStreamEnabled: snapshot.mainStreamEnabled,
    frameAnalysis: snapshot.frameAnalysis,
    activePercent: percent(snapshot.loopMs, snapshot.uptimeMs),
    zoomPercent: percent(snapshot.zoomTicks, objectFrames),
    zoomWindows: per(snapshot.zoomWindows, snapshot.zoomTicks),
    objectsPerFrame: per(snapshot.objects, judgedFrames),
    hitPercent: percent(snapshot.framesWithObjects, judgedFrames),
    switches: snapshot.switches,
    minutes: Math.round(snapshot.uptimeMs / 60_000),
  };
}
