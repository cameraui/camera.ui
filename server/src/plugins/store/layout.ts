const CANONICAL_SECTIONS = new Set(['plugin', 'cameras', 'sensors']);
const LEGACY_SENSOR_MARKER = ':sensor:';

export function isCanonicalLayout(payload: Record<string, any>): boolean {
  return Object.keys(payload).every((key) => CANONICAL_SECTIONS.has(key));
}

function isGoLegacyLayout(payload: Record<string, any>, pluginId: string): boolean {
  const keys = Object.keys(payload);
  return keys.length > 0 && keys.every((key) => key.startsWith(`${pluginId}.`));
}

export function remapLegacyLayout(payload: Record<string, any>, pluginId: string): Record<string, any> {
  if (isCanonicalLayout(payload) || isGoLegacyLayout(payload, pluginId)) {
    return payload;
  }

  const canonical: Record<string, any> = {};
  for (const section of CANONICAL_SECTIONS) {
    if (payload[section] !== undefined) {
      canonical[section] = payload[section];
    }
  }

  for (const [key, values] of Object.entries(payload)) {
    if (CANONICAL_SECTIONS.has(key)) {
      continue;
    }

    if (key === 'storage') {
      if (canonical.plugin !== undefined) {
        continue;
      }
      canonical.plugin = values;
      continue;
    }

    const sensorIdx = key.indexOf(LEGACY_SENSOR_MARKER);
    if (sensorIdx !== -1) {
      // <camId>:sensor:<type>:<pluginId>:<name> — type and pluginId contain no
      // colons; the name keeps everything after them verbatim.
      const cameraId = key.slice(0, sensorIdx);
      const rest = key.slice(sensorIdx + LEGACY_SENSOR_MARKER.length);
      const typeEnd = rest.indexOf(':');
      const pluginEnd = rest.indexOf(':', typeEnd + 1);
      if (typeEnd !== -1 && pluginEnd !== -1) {
        const sensorType = rest.slice(0, typeEnd);
        const sensorName = rest.slice(pluginEnd + 1);
        if (canonical.sensors?.[cameraId]?.[sensorType]?.[sensorName] !== undefined) {
          continue;
        }
        canonical.sensors ??= {};
        canonical.sensors[cameraId] ??= {};
        canonical.sensors[cameraId][sensorType] ??= {};
        canonical.sensors[cameraId][sensorType][sensorName] = values;
        continue;
      }
    }

    if (canonical.cameras?.[key] !== undefined) {
      continue;
    }
    canonical.cameras ??= {};
    canonical.cameras[key] = values;
  }

  return canonical;
}
