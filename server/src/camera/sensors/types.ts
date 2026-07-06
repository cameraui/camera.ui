import {
  AudioProperty,
  BatteryCapability,
  BatteryProperty,
  ClassifierProperty,
  ContactProperty,
  DoorbellProperty,
  FaceProperty,
  GarageProperty,
  HumidityProperty,
  LeakProperty,
  LicensePlateProperty,
  LightCapability,
  LightProperty,
  LockProperty,
  MotionProperty,
  ObjectProperty,
  OccupancyProperty,
  PTZProperty,
  SecuritySystemProperty,
  SensorType,
  SirenCapability,
  SirenProperty,
  SmokeProperty,
  SensorCategory,
  SwitchProperty,
  TemperatureProperty,
} from '@camera.ui/sdk';

export interface SensorTypeMetadata {
  category: SensorCategory;
  assignmentKey: string;
  multiProvider: boolean;
  isDetectionType: boolean;
  cascadeTrigger?: { property: string; value: unknown; sustained: boolean };
}

export const SENSOR_TYPE_CONFIG: Record<SensorType, SensorTypeMetadata> = {
  [SensorType.Motion]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'motion',
    multiProvider: false,
    isDetectionType: true,
  },
  [SensorType.Object]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'object',
    multiProvider: false,
    isDetectionType: true,
  },
  [SensorType.Audio]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'audio',
    multiProvider: false,
    isDetectionType: true,
  },
  [SensorType.Face]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'face',
    multiProvider: false,
    isDetectionType: true,
  },
  [SensorType.LicensePlate]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'licensePlate',
    multiProvider: false,
    isDetectionType: true,
  },
  [SensorType.Classifier]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'classifier',
    multiProvider: true,
    isDetectionType: true,
  },
  [SensorType.Clip]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'clip',
    multiProvider: false,
    isDetectionType: true,
  },
  [SensorType.Contact]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'contact',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'detected', value: true, sustained: true },
  },

  [SensorType.Light]: {
    category: SensorCategory.Control,
    assignmentKey: 'light',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'on', value: true, sustained: true },
  },
  [SensorType.Siren]: {
    category: SensorCategory.Control,
    assignmentKey: 'siren',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'active', value: true, sustained: true },
  },
  [SensorType.Switch]: {
    category: SensorCategory.Control,
    assignmentKey: 'switch',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'on', value: true, sustained: true },
  },
  [SensorType.PTZ]: {
    category: SensorCategory.Control,
    assignmentKey: 'ptz',
    multiProvider: false,
    isDetectionType: false,
  },
  [SensorType.Lock]: {
    category: SensorCategory.Control,
    assignmentKey: 'lock',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'currentState', value: 1, sustained: true },
  },
  [SensorType.SecuritySystem]: {
    category: SensorCategory.Control,
    assignmentKey: 'securitySystem',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'currentState', value: 4, sustained: true },
  },

  [SensorType.Doorbell]: {
    category: SensorCategory.Trigger,
    assignmentKey: 'doorbell',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'ring', value: true, sustained: false },
  },

  [SensorType.Temperature]: {
    category: SensorCategory.Info,
    assignmentKey: 'temperature',
    multiProvider: true,
    isDetectionType: false,
  },
  [SensorType.Humidity]: {
    category: SensorCategory.Info,
    assignmentKey: 'humidity',
    multiProvider: true,
    isDetectionType: false,
  },
  [SensorType.Occupancy]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'occupancy',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'detected', value: true, sustained: true },
  },
  [SensorType.Smoke]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'smoke',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'detected', value: true, sustained: true },
  },
  [SensorType.Leak]: {
    category: SensorCategory.Sensor,
    assignmentKey: 'leak',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'detected', value: true, sustained: true },
  },
  [SensorType.Garage]: {
    category: SensorCategory.Control,
    assignmentKey: 'garage',
    multiProvider: true,
    isDetectionType: false,
    cascadeTrigger: { property: 'currentState', value: 0, sustained: true },
  },

  [SensorType.Battery]: {
    category: SensorCategory.Info,
    assignmentKey: 'battery',
    multiProvider: false,
    isDetectionType: false,
  },
};

export const PROPERTY_CAPABILITY_MAP: Partial<Record<SensorType, Record<string, string>>> = {
  [SensorType.Battery]: {
    [BatteryProperty.Charging]: BatteryCapability.Charging,
    [BatteryProperty.Low]: BatteryCapability.LowBattery,
  },
  [SensorType.Light]: {
    [LightProperty.Brightness]: LightCapability.Brightness,
  },
  [SensorType.Siren]: {
    [SirenProperty.Volume]: SirenCapability.Volume,
  },
};

export function getMultiProviderTypes(): SensorType[] {
  return Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => meta.multiProvider)
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

export const SENSOR_PROPERTY_MAP: Record<SensorType, string[]> = {
  [SensorType.Motion]: Object.values(MotionProperty),
  [SensorType.Object]: Object.values(ObjectProperty),
  [SensorType.Audio]: Object.values(AudioProperty),
  [SensorType.Face]: Object.values(FaceProperty),
  [SensorType.LicensePlate]: Object.values(LicensePlateProperty),
  [SensorType.Classifier]: Object.values(ClassifierProperty),
  [SensorType.Clip]: [],
  [SensorType.Contact]: Object.values(ContactProperty),
  [SensorType.Temperature]: Object.values(TemperatureProperty),
  [SensorType.Humidity]: Object.values(HumidityProperty),
  [SensorType.Occupancy]: Object.values(OccupancyProperty),
  [SensorType.Smoke]: Object.values(SmokeProperty),
  [SensorType.Leak]: Object.values(LeakProperty),
  [SensorType.Light]: Object.values(LightProperty),
  [SensorType.Siren]: Object.values(SirenProperty),
  [SensorType.Switch]: Object.values(SwitchProperty),
  [SensorType.Lock]: Object.values(LockProperty),
  [SensorType.Garage]: Object.values(GarageProperty),
  [SensorType.PTZ]: Object.values(PTZProperty),
  [SensorType.SecuritySystem]: Object.values(SecuritySystemProperty),
  [SensorType.Doorbell]: Object.values(DoorbellProperty),
  [SensorType.Battery]: Object.values(BatteryProperty),
};

export function getSensorProperties(type: SensorType): string[] {
  return SENSOR_PROPERTY_MAP[type] ?? [];
}

export const MULTI_PROVIDER_TYPES = new Set<SensorType>(getMultiProviderTypes());

export const DETECTION_SENSOR_TYPES: ReadonlySet<SensorType> = new Set(getDetectionTypes());
