import { createHash } from 'node:crypto';

const SEPARATOR = '\u0000';

export function computeSensorStableId(pluginId: string, sensorType: string, sensorName: string): string {
  const hash = createHash('sha1').update([pluginId, sensorType, sensorName].join(SEPARATOR)).digest('hex').slice(0, 6);
  return `${slugify(sensorType)}_${slugify(sensorName)}_${hash}`;
}

export function computeSensorGlobalId(cameraId: string, stableId: string): string {
  return `${cameraId}_${stableId}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}
