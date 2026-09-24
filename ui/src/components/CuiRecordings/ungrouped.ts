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
  return item.event.thumbnailAt ?? item.event.startTime;
}

export function newestFirst(a: UngroupedItem, b: UngroupedItem): number {
  return ungroupedItemTime(b) - ungroupedItemTime(a);
}

export function buildUngroupedItems(events: RecordedEvent[], keepOrder = false): UngroupedItem[] {
  const items: UngroupedItem[] = [];
  for (const event of events) {
    const segments = event.segments ?? [];
    if (segments.length <= 1) {
      items.push({ event, key: event.id });
      continue;
    }
    const moments: UngroupedItem[] = [];
    segments.forEach((segment, index) => {
      if (segment) moments.push({ event, key: `${event.id}:seg:${index}`, segIndex: index });
    });
    items.push(...moments.sort(newestFirst));
  }
  return keepOrder ? items : items.sort(newestFirst);
}
