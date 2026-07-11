import { createHash } from 'node:crypto';

export function computeSensorStableId(pluginId: string, sensorType: string, sensorName: string): string {
  const hash = createHash('sha1').update(`${pluginId}\u0000${sensorType}\u0000${sensorName}`).digest('hex').slice(0, 6);
  return `${slugify(sensorType)}_${slugify(sensorName)}_${hash}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}
