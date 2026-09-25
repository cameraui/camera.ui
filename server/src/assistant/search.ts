import { BASE_AUDIO_LABELS, DETECTION_ATTRIBUTES, EVENT_TRIGGER_TYPES, OBJECT_DETECTION_LABELS } from '@camera.ui/sdk';
import * as zod from 'zod';

import { languageName } from './prompt.js';

import type { AssistantSearchFilters, AssistantSearchResult } from './types.js';

export interface SearchCamera {
  id: string;
  name: string;
  room?: string;
}

const OTHER_EVENT_TYPE = '__other__';
const VEHICLE_COLORS = ['white', 'gray', 'yellow', 'red', 'green', 'blue', 'black'] as const;
const VEHICLE_TYPES = ['car', 'van', 'truck', 'bus', 'motorcycle', 'bicycle'] as const;

export const SEARCH_SCHEMA = zod.object({
  contentKind: zod.enum(['all', 'events', 'episodes']),
  favoritesOnly: zod.boolean(),
  cameras: zod.array(zod.string()),
  rooms: zod.array(zod.string()),
  timeRange: zod.enum(['1h', '1d', '1w', '1m', 'none']),
  eventTypes: zod.array(zod.enum([...OBJECT_DETECTION_LABELS, 'other'] as const)),
  attributes: zod.array(zod.enum(DETECTION_ATTRIBUTES)),
  vehicleColors: zod.array(zod.enum(VEHICLE_COLORS)),
  vehicleTypes: zod.array(zod.enum(VEHICLE_TYPES)),
  sensorEvents: zod.array(zod.enum(EVENT_TRIGGER_TYPES)),
  audioLabels: zod.array(zod.enum(BASE_AUDIO_LABELS)),
  search: zod.string(),
  semanticQuery: zod.string(),
  note: zod.string(),
});

export type SearchOutput = zod.output<typeof SEARCH_SCHEMA>;

export function searchPrompt(cameras: SearchCamera[], language: string, timezone: string): string {
  const now = new Date();
  const rooms = Array.from(new Set(cameras.map((camera) => camera.room).filter((room): room is string => !!room)));
  // prettier-ignore
  return [
    'You translate a wish about recorded camera events into the filters of the recordings page. Answer only with the filter object.',
    `Current time: ${now.toLocaleString('en-GB', { timeZone: timezone, hour12: false })} (${timezone}). The user writes in ${languageName(language)}.`,
    '',
    `Cameras (name, room): ${cameras.map((camera) => `${camera.name}${camera.room ? ` (${camera.room})` : ''}`).join('; ') || 'none'}.`,
    `Rooms: ${rooms.join(', ') || 'none'}.`,
    '',
    'Fields:',
    '- contentKind: events for single recordings, episodes for stories that group related events, all when the wish does not say.',
    '- cameras and rooms: exact names from the lists above, empty when the wish names none. A camera named by its room goes into cameras.',
    '- timeRange: the smallest of 1h, 1d, 1w, 1m that covers the wish (yesterday needs 1w, last month 1m), none when no time is given.',
    '- eventTypes: what was detected, person, vehicle, animal or other. attributes: face for recognized people, license_plate for plates.',
    '- vehicleColors and vehicleTypes: the color and the kind of a vehicle the wish names, the closest allowed value ' +
    '(silver is gray, a pickup is a truck), empty otherwise.',
    '- sensorEvents: the trigger when the wish is about one (doorbell, contact, motion, audio, line-crossing and so on). ' +
    'audioLabels only together with audio in sensorEvents.',
    '- search: words that name a person, a plate or a description text, empty otherwise.',
    '- semanticQuery: when the wish describes a scene beyond the fields above (clothing, an action, an object like a parcel), ' +
    'an English scene description ("a person carrying a parcel to the door"), empty otherwise.',
    '- favoritesOnly: only when the wish asks for favorites or starred recordings.',
    `- note: one short sentence in ${languageName(language)} about the part of the wish the filters cannot express ` +
    '(an exact day, a name of a person unknown here), empty otherwise.',
  ].join('\n');
}

export function toSearchResult(output: SearchOutput, cameras: SearchCamera[]): AssistantSearchResult {
  const rooms = new Set(cameras.map((camera) => camera.room).filter((room): room is string => !!room));
  const filters: AssistantSearchFilters = {
    contentKind: output.contentKind,
    favoritesOnly: output.favoritesOnly,
    cameraIds: output.cameras.map((name) => cameraByName(cameras, name)?.id).filter((id): id is string => !!id),
    rooms: output.rooms.filter((room) => rooms.has(room)),
    timeRange: output.timeRange === 'none' ? null : output.timeRange,
    eventTypes: output.eventTypes.map((type) => (type === 'other' ? OTHER_EVENT_TYPE : type)),
    hasAttributes: output.attributes,
    vehicleColors: output.vehicleColors,
    vehicleTypes: output.vehicleTypes,
    sensorEvents: output.sensorEvents,
    audioLabels: output.sensorEvents.includes('audio') ? output.audioLabels : [],
    search: output.search.trim(),
    semanticQuery: output.semanticQuery.trim(),
  };
  return { filters, note: output.note.trim() };
}

function cameraByName(cameras: SearchCamera[], name: string): SearchCamera | undefined {
  const wanted = name.trim().toLowerCase();
  return cameras.find((camera) => camera.name.toLowerCase() === wanted) ?? cameras.find((camera) => camera.name.toLowerCase().includes(wanted));
}
