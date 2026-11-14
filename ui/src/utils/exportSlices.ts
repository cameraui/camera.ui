import type { NvrExportSlice } from '@camera.ui/nvr';

export const EXPORT_DAY_MS = 24 * 60 * 60 * 1000;

export function exportDaySlices(startMs: number, endMs: number): NvrExportSlice[] {
  const slices: NvrExportSlice[] = [];
  const day = new Date(startMs);
  day.setHours(0, 0, 0, 0);
  while (day.getTime() < endMs) {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const sliceStart = Math.max(day.getTime(), startMs);
    const sliceEnd = Math.min(nextDay.getTime(), endMs);
    if (sliceEnd > sliceStart) slices.push({ day: dayKey(day), startUs: sliceStart * 1000, endUs: sliceEnd * 1000 });
    day.setDate(day.getDate() + 1);
  }
  return slices;
}

function dayKey(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}
