import type { HaHost } from '@/connection/modes/ha.js';

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HomeAssistant extends HaHost {
  states: Record<string, HassEntityState | undefined>;
  panels?: Record<string, unknown>;
  language?: string;
  themes?: { darkMode?: boolean };
}

export type ClickAction = 'ha' | 'popup' | 'none';

export interface HaCameraCardConfig {
  type: string;
  entity: string;
  title?: string;
  click?: ClickAction;
  controls?: boolean;
  toolbar?: boolean;
  fit?: 'contain' | 'cover';
  detection_indicator?: boolean;
  mode?: 'snapshot' | 'live';
}

export interface HaEventsCardConfig {
  type: string;
  entities?: string[];
}

export interface HaViewCardConfig {
  type: string;
  view?: string;
  rearrange?: boolean;
  entry?: string;
}

export interface HaCameraAttributes {
  camera_name?: string;
  entry_id?: string;
  friendly_name?: string;
}

export function cameraAttributes(hass: HomeAssistant | undefined, entityId: string | undefined): HaCameraAttributes {
  if (!hass || !entityId) return {};
  return (hass.states[entityId]?.attributes ?? {}) as HaCameraAttributes;
}

export function isCameraUiCamera(hass: HomeAssistant | undefined, entityId: string): boolean {
  if (entityId.split('.')[0] !== 'camera') return false;
  const attrs = cameraAttributes(hass, entityId);
  return Boolean(attrs.entry_id && attrs.camera_name);
}

export function entryIdFromPanels(hass: HomeAssistant | undefined): string | undefined {
  const key = Object.keys(hass?.panels ?? {}).find((path) => path.startsWith('cameraui-'));
  return key?.slice('cameraui-'.length) || undefined;
}

export function entryIds(hass: HomeAssistant): string[] {
  const ids = new Set<string>();
  for (const entity of cameraEntities(hass)) {
    const id = cameraAttributes(hass, entity).entry_id;
    if (id) ids.add(id);
  }
  return [...ids];
}

export function cameraEntities(hass: HomeAssistant): string[] {
  return Object.keys(hass.states).filter((id) => id.startsWith('camera.'));
}

export function firstCameraUiCamera(hass: HomeAssistant | undefined): string | undefined {
  if (!hass) return undefined;
  return Object.keys(hass.states).find((id) => isCameraUiCamera(hass, id));
}
