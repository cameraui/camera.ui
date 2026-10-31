import type { RecentEventTypes } from '@/composables/useRecentEventTypes.js';
import type { DBCamera } from '@shared/types';

export interface RecentEventsFilterProps extends RecentEventTypes {
  cameras: DBCamera[];
}

export const RECENT_EVENTS_FILTER_TYPES = ['person', 'vehicle', 'animal', 'face', 'license_plate', 'sensor', 'alarm_sound'] as const;

// off until a camera is picked, stored as shown types
export const RECENT_EVENTS_OPT_IN_TYPES = ['other_sound', 'motion'] as const;
