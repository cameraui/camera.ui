import { SENSOR_META, SensorCategory } from '@camera.ui/sdk';

import type { SensorMeta, SensorType } from '@camera.ui/sdk';

export interface SensorTypeMetadata {
  category: SensorCategory;
  assignmentKey: string;
  multiProvider: boolean;
  isDetectionType: boolean;
  cascadeTrigger?: { property: string; value: unknown; sustained: boolean };
}

function buildSensorTypeConfig(): Record<SensorType, SensorTypeMetadata> {
  const config = {} as Record<SensorType, SensorTypeMetadata>;
  for (const meta of SENSOR_META as readonly SensorMeta[]) {
    config[meta.type] = {
      category: meta.category,
      assignmentKey: meta.assignmentKey,
      multiProvider: meta.multiProvider,
      isDetectionType: meta.isDetectionType,
      ...(meta.cascadeTrigger ? { cascadeTrigger: meta.cascadeTrigger } : {}),
    };
  }
  return config;
}

export const SENSOR_TYPE_CONFIG: Record<SensorType, SensorTypeMetadata> = buildSensorTypeConfig();

export const PROPERTY_CAPABILITY_MAP: Partial<Record<SensorType, Record<string, string>>> = Object.fromEntries(
  (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.propertyCapabilities).map((meta) => [meta.type, meta.propertyCapabilities]),
);

export function getMultiProviderTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => meta.multiProvider)
    .map(([type]) => type as SensorType);
}

export function getShortcutableTypes(): SensorType[] {
  return (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.shortcutable).map((meta) => meta.type);
}

export function getSingleProviderTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => !meta.multiProvider)
    .map(([type]) => type as SensorType);
}

export function getDetectionTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => meta.isDetectionType)
    .map(([type]) => type as SensorType);
}

export function getValidSensorTypes(): SensorType[] {
  return Object.keys(SENSOR_TYPE_CONFIG) as SensorType[];
}

export function getAssignmentKey(type: SensorType): string {
  return SENSOR_TYPE_CONFIG[type].assignmentKey;
}

export function getSensorTypeMetadata(type: SensorType): SensorTypeMetadata {
  return SENSOR_TYPE_CONFIG[type];
}

export function getDetectionSensorTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => meta.category === SensorCategory.Sensor && !meta.multiProvider)
    .map(([type]) => type as SensorType);
}

export function getCoreSensorTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => !meta.multiProvider && meta.category !== SensorCategory.Sensor)
    .map(([type]) => type as SensorType);
}

export function getAccessorySensorTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => meta.multiProvider)
    .map(([type]) => type as SensorType);
}

export function isSingleProviderType(type: SensorType): boolean {
  return !SENSOR_TYPE_CONFIG[type].multiProvider;
}

export const SENSOR_PROPERTY_MAP: Record<SensorType, string[]> = Object.fromEntries(
  (SENSOR_META as readonly SensorMeta[]).map((meta) => [meta.type, [...meta.properties]]),
) as Record<SensorType, string[]>;

export function getSensorProperties(type: SensorType): string[] {
  return SENSOR_PROPERTY_MAP[type] ?? [];
}

export const MULTI_PROVIDER_TYPES = new Set<SensorType>(getMultiProviderTypes());

export const DETECTION_SENSOR_TYPES: ReadonlySet<SensorType> = new Set(getDetectionTypes());

export const VIRTUAL_SENSOR_OWNER_ID = 'cameraui.virtual';
export const VIRTUAL_SENSOR_OWNER_NAME = 'Virtual';

export type VirtualSensorType = Extract<(typeof SENSOR_META)[number], { virtual: object }>['type'];

export const VIRTUAL_SENSOR_TYPES = (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.virtual).map((meta) => meta.type) as VirtualSensorType[];

export const VIRTUAL_SENSOR_DEFAULT_PROPERTIES = Object.fromEntries(
  (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.virtual).map((meta) => [meta.type, meta.virtual?.properties ?? {}]),
) as Record<VirtualSensorType, Record<string, unknown>>;

export const VIRTUAL_SENSOR_DEFAULT_CAPABILITIES = Object.fromEntries(
  (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.virtual?.capabilities).map((meta) => [meta.type, meta.virtual?.capabilities]),
) as Partial<Record<VirtualSensorType, string[]>>;

export function isVirtualSensorType(type: SensorType): type is VirtualSensorType {
  return (VIRTUAL_SENSOR_TYPES as readonly SensorType[]).includes(type);
}
