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

export function buildUngroupedItems(events: RecordedEvent[]): UngroupedItem[] {
  const items: UngroupedItem[] = [];
  for (const event of events) {
    const segments = event.segments ?? [];
    if (segments.length <= 1) {
      items.push({ event, key: event.id });
      continue;
    }
    segments.forEach((segment, index) => {
      if (segment) items.push({ event, key: `${event.id}:seg:${index}`, segIndex: index });
    });
  }
  items.sort((a, b) => ungroupedItemTime(b) - ungroupedItemTime(a));
  return items;
}
