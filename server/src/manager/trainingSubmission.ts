import { createHash } from 'node:crypto';

import { jpegSize } from '../utils/image.js';

import type { DBTrainingCandidate, DBTrainingCandidateBox } from '../api/database/types.js';
import type { TrainBoxEdit, TrainSubmissionBox, TrainSubmissionDocument } from '../remote/api/routes/train.js';

const EDIT_EPSILON = 0.002;
const MAX_REVIEW_MS = 60 * 60 * 1000;
const TAXONOMY = 1;

export function trainingCameraKey(instanceId: string, cameraId: string): string {
  return createHash('sha256').update(`${instanceId}:${cameraId}`).digest('hex').slice(0, 16);
}

export function buildTrainSubmission(candidate: DBTrainingCandidate, image: Uint8Array, instanceId: string, appVersion: string): TrainSubmissionDocument {
  const frame = jpegSize(image);
  if (!frame) throw new Error('Training image is not a readable JPEG');

  const proposals = candidate.proposals;
  const used = new Set(candidate.boxes.map((box) => box.proposal));
  const unused = proposals?.filter((_, i) => !used.has(i));
  const detector = candidate.meta?.detector;

  return {
    v: 2,
    captured_at: candidate.createdAt,
    meta: {
      camera_key: trainingCameraKey(instanceId, candidate.cameraId),
      frame,
      ...(detector ? { detector: { plugin: detector.plugin, plugin_version: detector.pluginVersion } } : {}),
      app_version: candidate.meta?.appVersion ?? appVersion,
      taxonomy: TAXONOMY,
      ...(candidate.reviewMs !== undefined ? { review_ms: Math.min(Math.round(candidate.reviewMs), MAX_REVIEW_MS) } : {}),
    },
    boxes: candidate.boxes.map((box) => wireBox(box, box.proposal !== undefined ? proposals?.[box.proposal] : undefined)),
    rejected: unused ? unused.filter((box) => box.source !== 'suggestion').map((box) => wireBox(box)) : null,
    dismissed: unused ? unused.filter((box) => box.source === 'suggestion').map((box) => wireBox(box)) : null,
  };
}

export function withProvenance(box: DBTrainingCandidateBox, proposals: DBTrainingCandidateBox[] | undefined): DBTrainingCandidateBox {
  if (!proposals) return box;
  const { proposal, score: _score, ...rest } = box;
  const origin = proposal !== undefined ? proposals[proposal] : undefined;
  if (origin) return { ...rest, source: origin.source, score: origin.score, proposal };
  return { ...rest, source: box.source === 'copied' ? 'copied' : 'drawn' };
}

function wireBox(box: DBTrainingCandidateBox, origin?: DBTrainingCandidateBox): TrainSubmissionBox {
  const edited = origin ? edits(box, origin) : [];
  return {
    label: box.label,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(box.text ? { text: box.text } : {}),
    source: box.source,
    ...(box.score !== undefined ? { score: box.score } : {}),
    ...(edited.length > 0 ? { edited } : {}),
  };
}

function edits(box: DBTrainingCandidateBox, origin: DBTrainingCandidateBox): TrainBoxEdit[] {
  const edited: TrainBoxEdit[] = [];
  const dw = box.width - origin.width;
  const dh = box.height - origin.height;
  const dx = box.x + box.width / 2 - (origin.x + origin.width / 2);
  const dy = box.y + box.height / 2 - (origin.y + origin.height / 2);
  // dragging a corner shifts the center by half the size change, that alone is no move
  if (Math.abs(dx) > Math.abs(dw) / 2 + EDIT_EPSILON || Math.abs(dy) > Math.abs(dh) / 2 + EDIT_EPSILON) edited.push('moved');
  if (Math.abs(dw) > EDIT_EPSILON || Math.abs(dh) > EDIT_EPSILON) edited.push('resized');
  if (box.label !== origin.label) edited.push('relabeled');
  return edited;
}
