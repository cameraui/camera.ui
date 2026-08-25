import type { RecordedEpisode, RecordedEvent } from '@camera.ui/nvr';

export interface UngroupedItem {
  event: RecordedEvent;
  key: string;
  segIndex?: number;
  episode?: RecordedEpisode;
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
  return items;
}
