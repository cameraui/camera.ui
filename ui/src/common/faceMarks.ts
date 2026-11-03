import { FACE_CLARITY_CLEAR, FACE_CLARITY_UNCLEAR } from './constants.js';

export interface UnassignedFaceMarks {
  count: number;
  danger: boolean;
}

interface UnassignedFace {
  clarity?: number;
  alsoFiledUnder?: string[];
}

export function isPartlyVisible(clarity: number | undefined): boolean {
  return clarity !== undefined && clarity >= FACE_CLARITY_UNCLEAR && clarity < FACE_CLARITY_CLEAR;
}

export function countUnassignedMarks(faces: UnassignedFace[]): UnassignedFaceMarks {
  let count = 0;
  let danger = false;
  for (const face of faces) {
    const filed = !!face.alsoFiledUnder?.length;
    if (filed || isPartlyVisible(face.clarity)) count++;
    if (filed) danger = true;
  }
  return { count, danger };
}
