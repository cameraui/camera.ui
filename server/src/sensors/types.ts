import { SENSOR_META, SensorCategory } from '@camera.ui/sdk';

import type { EventTriggerType, SensorMeta, SensorPropertySpec, SensorType, SensorVirtualDefaults } from '@camera.ui/sdk';

export interface SensorTypeMetadata {
  category: SensorCategory;
  assignmentKey: string;
  multiProvider: boolean;
  isDetectionType: boolean;
  cameraBound: boolean;
  cascadeTrigger?: { property: string; values: readonly unknown[]; sustained: boolean; triggerType: EventTriggerType };
}

const TRIGGER_TYPE_BY_KEY: Readonly<Record<string, EventTriggerType>> = {
  securitySystem: 'security_system',
  outlet: 'switch',
};

function eventTriggerType(assignmentKey: string): EventTriggerType {
  return TRIGGER_TYPE_BY_KEY[assignmentKey] ?? (assignmentKey as EventTriggerType);
}

function buildSensorTypeConfig(): Record<SensorType, SensorTypeMetadata> {
  const config = {} as Record<SensorType, SensorTypeMetadata>;
  for (const meta of SENSOR_META as readonly SensorMeta[]) {
    config[meta.type] = {
      category: meta.category,
      assignmentKey: meta.assignmentKey,
      multiProvider: meta.multiProvider,
      isDetectionType: meta.isDetectionType,
      cameraBound: meta.cameraBound ?? false,
      ...(meta.cascadeTrigger ? { cascadeTrigger: { ...meta.cascadeTrigger, triggerType: eventTriggerType(meta.assignmentKey) } } : {}),
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

export function isKnownSensorType(type: string): type is SensorType {
  return Object.hasOwn(SENSOR_TYPE_CONFIG, type);
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
  (SENSOR_META as readonly SensorMeta[]).map((meta) => [meta.type, Object.keys(meta.properties)]),
) as Record<SensorType, string[]>;

export const SENSOR_PROPERTY_SPECS: Record<SensorType, Readonly<Record<string, SensorPropertySpec>>> = Object.fromEntries(
  (SENSOR_META as readonly SensorMeta[]).map((meta) => [meta.type, meta.properties]),
) as Record<SensorType, Readonly<Record<string, SensorPropertySpec>>>;

export function getSensorProperties(type: SensorType): string[] {
  return SENSOR_PROPERTY_MAP[type] ?? [];
}

export function getSensorPropertySpec(type: SensorType | string, property: string): SensorPropertySpec | undefined {
  return SENSOR_PROPERTY_SPECS[type as SensorType]?.[property];
}

export function sensorPropertySpec(
  sensor: { type: SensorType | string; propertySpecs: Readonly<Record<string, SensorPropertySpec>> },
  property: string,
): SensorPropertySpec | undefined {
  return sensor.propertySpecs[property] ?? getSensorPropertySpec(sensor.type, property);
}

export function getObservableSensorProperties(type: SensorType | string): string[] {
  const specs = SENSOR_PROPERTY_SPECS[type as SensorType];
  if (!specs) return [];
  return Object.entries(specs)
    .filter(([, spec]) => !spec.internal)
    .map(([name]) => name);
}

export function getWritableSensorProperties(type: SensorType | string): string[] {
  const specs = SENSOR_PROPERTY_SPECS[type as SensorType];
  if (!specs) return [];
  return Object.entries(specs)
    .filter(([, spec]) => spec.writable)
    .map(([name]) => name);
}

export function isWritableSensor(type: SensorType | string, pluginId?: string): boolean {
  const meta = SENSOR_TYPE_CONFIG[type as SensorType];
  if (!meta) return false;
  if (meta.category === SensorCategory.Control || meta.category === SensorCategory.Trigger) return true;
  return pluginId === VIRTUAL_SENSOR_OWNER_ID && !meta.isDetectionType;
}

export const MULTI_PROVIDER_TYPES = new Set<SensorType>(getMultiProviderTypes());

export const DETECTION_SENSOR_TYPES: ReadonlySet<SensorType> = new Set(getDetectionTypes());

export const VIRTUAL_SENSOR_OWNER_ID = 'cameraui.virtual';
export const VIRTUAL_SENSOR_OWNER_NAME = 'Virtual';

export type VirtualSensorType = Extract<(typeof SENSOR_META)[number], { virtual: object }>['type'];

export const VIRTUAL_SENSOR_TYPES = (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.virtual).map((meta) => meta.type) as VirtualSensorType[];

export interface VirtualSensorCapabilities {
  offered: string[];
  defaults: string[];
}

const VIRTUAL_DEFAULTS = Object.fromEntries((SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.virtual).map((meta) => [meta.type, meta.virtual])) as Record<
  VirtualSensorType,
  SensorVirtualDefaults
>;

export const VIRTUAL_SENSOR_CAPABILITIES = Object.fromEntries(
  Object.entries(VIRTUAL_DEFAULTS)
    .filter(([, virtual]) => virtual.optionalCapabilities)
    .map(([type, virtual]) => [type, { offered: Object.keys(virtual.optionalCapabilities ?? {}), defaults: [...(virtual.capabilities ?? [])] }]),
) as Partial<Record<VirtualSensorType, VirtualSensorCapabilities>>;

export function virtualSensorStartState(type: VirtualSensorType, capabilities: readonly string[]): Record<string, unknown> {
  const virtual = VIRTUAL_DEFAULTS[type];
  return Object.assign({ ...virtual.properties }, ...capabilities.map((capability) => virtual.optionalCapabilities?.[capability]));
}

export function isVirtualSensorType(type: SensorType): type is VirtualSensorType {
  return (VIRTUAL_SENSOR_TYPES as readonly SensorType[]).includes(type);
}
