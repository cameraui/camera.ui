import { eventCardTime } from '@camera.ui/nvr';

import type { RecordedEpisode, RecordedEvent } from '@camera.ui/nvr';

export interface UngroupedItem {
  event: RecordedEvent;
  key: string;
  segIndex?: number;
  episode?: RecordedEpisode;
}

export function ungroupedItemTime(item: UngroupedItem): number {
  if (item.episode) return item.episode.endTime;
  if (item.segIndex !== undefined) {
    const segment = item.event.segments?.[item.segIndex];
    if (segment) return segment.firstSeen;
  }
  return eventCardTime(item.event);
}

export function newestFirst(a: UngroupedItem, b: UngroupedItem): number {
  return ungroupedItemTime(b) - ungroupedItemTime(a);
}

export function buildUngroupedItems(events: RecordedEvent[], keepOrder = false): UngroupedItem[] {
  const items: UngroupedItem[] = [];
  for (const event of events) {
    const segments = event.segments ?? [];
    const shown = segments.flatMap((segment, index) => (segment ? [index] : []));
    if (segments.length <= 1 || shown.length === 0) {
      items.push({ event, key: event.id });
      continue;
    }
    const moments = shown.map((index) => ({ event, key: `${event.id}:seg:${index}`, segIndex: index }));
    items.push(...moments.sort(newestFirst));
  }
  return keepOrder ? items : items.sort(newestFirst);
}
