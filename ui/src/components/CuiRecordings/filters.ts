import type { GetEventsOptions } from '@camera.ui/nvr';

export function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export const VEHICLE_SWATCHES: Record<string, string> = {
  white: '#f5f5f5',
  gray: '#9ca3af',
  yellow: '#facc15',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  black: '#111827',
};

export function triggerQuery(sensorEvents: string[], audioLabels: string[]): Pick<GetEventsOptions, 'triggers' | 'triggerLabels'> {
  return {
    triggers: sensorEvents.length > 0 ? sensorEvents : undefined,
    triggerLabels: audioLabels.length > 0 ? audioLabels : undefined,
  };
}

export function vehicleAttributeLabels(colors: string[], types: string[]): Record<string, string[]> | undefined {
  if (!colors.length && !types.length) return undefined;
  const labels: Record<string, string[]> = {};
  if (colors.length) labels.color = colors;
  if (types.length) labels.vehicle_type = types;
  return labels;
}
