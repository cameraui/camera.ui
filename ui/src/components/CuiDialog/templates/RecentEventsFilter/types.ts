import type { DBCamera, HiddenEventTypes } from '@shared/types';

export interface RecentEventsFilterProps {
  cameras: DBCamera[];
  hidden: HiddenEventTypes;
}

export const RECENT_EVENTS_FILTER_TYPES = ['person', 'vehicle', 'animal', 'face', 'license_plate'] as const;
