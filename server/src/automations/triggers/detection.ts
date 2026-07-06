import { createEmptyContext } from '../context.js';

import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { TriggerContext } from './types.js';

export function subscribeDetection(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const cameraId = triggerNode.data.cameraId as string;
  if (!cameraId) return;

  const camera = ctx.api.getCamera(cameraId);
  if (!camera) {
    ctx.logger.warn(`Automation "${flow.name}": Camera "${cameraId}" not found for detection trigger`);
    return;
  }

  const eventPhases = (triggerNode.data.eventPhase as string[]) ?? [];
  const detectionLabels = (triggerNode.data.detectionLabels as string[]) ?? [];
  const confidenceThreshold = (triggerNode.data.confidenceThreshold as number) ?? 0;
  const audioLabels = (triggerNode.data.audioLabels as string[]) ?? [];
  const faceFilter = (triggerNode.data.faceFilter as string[]) ?? [];
  const licensePlateFilter = (triggerNode.data.licensePlateFilter as string[]) ?? [];

  ctx.logger.trace(
    `Automation "${flow.name}": Subscribed to detection on "${camera.name}" (phases: ${eventPhases.join(', ') || 'any'}, labels: ${detectionLabels.join(', ') || 'any'})`,
  );

  const sub = camera.onDetectionEvent.subscribe(({ type, event }) => {
    if (eventPhases.length > 0 && !eventPhases.includes(type)) return;

    if (detectionLabels.length > 0) {
      const eventLabels = new Set<string>();
      for (const t of event.types) eventLabels.add(t);
      for (const seg of event.segments ?? []) {
        for (const det of seg.detections ?? []) eventLabels.add(det.label);
      }
      if (!detectionLabels.some((l) => eventLabels.has(l))) return;
    }

    if (confidenceThreshold > 0 && (event.segments ?? []).length > 0) {
      const scores: number[] = [];
      for (const seg of event.segments ?? []) {
        for (const det of seg.detections ?? []) scores.push(det.score);
      }
      if (scores.length > 0 && Math.max(...scores) < confidenceThreshold) return;
    }

    if (audioLabels.length > 0) {
      const triggerLabels = new Set<string>();
      for (const trigger of event.triggers) {
        if (trigger.label) triggerLabels.add(trigger.label.toLowerCase());
      }
      if (!audioLabels.some((a) => triggerLabels.has(a.toLowerCase()))) return;
    }

    if (faceFilter.length > 0) {
      const faceLabels = new Set<string>();
      for (const seg of event.segments ?? []) {
        for (const attr of seg.attributes ?? []) {
          if (attr.type === 'face' && attr.label) faceLabels.add(attr.label.toLowerCase());
        }
      }
      if (!faceFilter.some((f) => faceLabels.has(f.toLowerCase()))) return;
    }

    if (licensePlateFilter.length > 0) {
      const plates = new Set<string>();
      for (const seg of event.segments ?? []) {
        for (const attr of seg.attributes ?? []) {
          if (attr.type === 'license_plate' && attr.label) plates.add(attr.label.toUpperCase());
        }
      }
      if (!licensePlateFilter.some((p) => plates.has(p.toUpperCase()))) return;
    }

    const bestScore = Math.max(
      0,
      ...(event.segments ?? []).flatMap((s: { detections?: { score: number }[] }) => (s.detections ?? []).map((d) => d.score)),
      ...event.triggers.map((t: { score?: number }) => t.score ?? 0),
    );

    const bestLabel =
      (event.segments ?? []).flatMap((s: { detections?: { label: string }[] }) => (s.detections ?? []).map((d) => d.label))[0] ??
      event.triggers[0]?.label ??
      event.types[0] ??
      '';

    const faces: string[] = [];
    const plates: string[] = [];
    for (const seg of event.segments ?? []) {
      for (const attr of seg.attributes ?? []) {
        if (attr.type === 'face' && attr.label) faces.push(attr.label);
        if (attr.type === 'license_plate' && attr.label) plates.push(attr.label);
      }
    }

    const context = createEmptyContext();
    context.event = {
      id: event.id,
      type: event.types.join(','),
      confidence: bestScore,
      label: bestLabel,
      cameraId: event.cameraId,
      state: event.state,
      faces: [...new Set(faces)],
      plates: [...new Set(plates)],
    };

    ctx.executeFlow(flow, triggerNode, context);
  });

  ctx.addSubscription(flow._id, sub);
}
