import { ChargingState, GarageState, LockState, SecuritySystemState, SensorType } from '@camera.ui/sdk';

export type SensorPropertyInputKind = 'boolean' | 'number' | 'enum' | 'text';

export interface SensorPropertyEnumOption {
  labelKey: string;
  value: string;
}

export interface SensorPropertyInputMeta {
  kind: SensorPropertyInputKind;
  min?: number;
  max?: number;
  options?: SensorPropertyEnumOption[];
}

const BOOLEAN: SensorPropertyInputMeta = { kind: 'boolean' };
const PERCENT: SensorPropertyInputMeta = { kind: 'number', min: 0, max: 100 };

const LOCK_STATES: SensorPropertyEnumOption[] = [
  { labelKey: 'lock_state_secured', value: String(LockState.Secured) },
  { labelKey: 'lock_state_unsecured', value: String(LockState.Unsecured) },
  { labelKey: 'lock_state_unknown', value: String(LockState.Unknown) },
];

const GARAGE_STATES: SensorPropertyEnumOption[] = [
  { labelKey: 'garage_state_open', value: String(GarageState.Open) },
  { labelKey: 'garage_state_closed', value: String(GarageState.Closed) },
  { labelKey: 'garage_state_opening', value: String(GarageState.Opening) },
  { labelKey: 'garage_state_closing', value: String(GarageState.Closing) },
  { labelKey: 'garage_state_stopped', value: String(GarageState.Stopped) },
];

const SECURITY_STATES: SensorPropertyEnumOption[] = [
  { labelKey: 'security_state_stay_arm', value: String(SecuritySystemState.StayArm) },
  { labelKey: 'security_state_away_arm', value: String(SecuritySystemState.AwayArm) },
  { labelKey: 'security_state_night_arm', value: String(SecuritySystemState.NightArm) },
  { labelKey: 'security_state_disarmed', value: String(SecuritySystemState.Disarmed) },
  { labelKey: 'security_state_alarm_triggered', value: String(SecuritySystemState.AlarmTriggered) },
];

const CHARGING_STATES: SensorPropertyEnumOption[] = [
  { labelKey: 'charging_state_not_chargeable', value: ChargingState.NotChargeable },
  { labelKey: 'charging_state_not_charging', value: ChargingState.NotCharging },
  { labelKey: 'charging_state_charging', value: ChargingState.Charging },
  { labelKey: 'charging_state_full', value: ChargingState.Full },
];

const SENSOR_PROPERTY_INPUTS: Partial<Record<SensorType, Record<string, SensorPropertyInputMeta>>> = {
  [SensorType.Motion]: { detected: BOOLEAN, blocked: BOOLEAN },
  [SensorType.Object]: { detected: BOOLEAN },
  [SensorType.Audio]: { detected: BOOLEAN, decibels: { kind: 'number' } },
  [SensorType.Face]: { detected: BOOLEAN },
  [SensorType.LicensePlate]: { detected: BOOLEAN },
  [SensorType.Classifier]: { detected: BOOLEAN },
  [SensorType.Contact]: { detected: BOOLEAN },
  [SensorType.Occupancy]: { detected: BOOLEAN },
  [SensorType.Smoke]: { detected: BOOLEAN },
  [SensorType.Leak]: { detected: BOOLEAN },
  [SensorType.Doorbell]: { ring: BOOLEAN },
  [SensorType.Switch]: { on: BOOLEAN },
  [SensorType.Light]: { on: BOOLEAN, brightness: PERCENT },
  [SensorType.Siren]: { active: BOOLEAN, volume: PERCENT },
  [SensorType.Lock]: { currentState: { kind: 'enum', options: LOCK_STATES }, targetState: { kind: 'enum', options: LOCK_STATES } },
  [SensorType.Garage]: {
    currentState: { kind: 'enum', options: GARAGE_STATES },
    targetState: { kind: 'enum', options: GARAGE_STATES },
    obstructionDetected: BOOLEAN,
  },
  [SensorType.SecuritySystem]: {
    currentState: { kind: 'enum', options: SECURITY_STATES },
    targetState: { kind: 'enum', options: SECURITY_STATES },
  },
  [SensorType.PTZ]: { moving: BOOLEAN, targetPreset: { kind: 'text' } },
  [SensorType.Temperature]: { current: { kind: 'number' } },
  [SensorType.Humidity]: { current: PERCENT },
  [SensorType.Battery]: { level: PERCENT, low: BOOLEAN, charging: { kind: 'enum', options: CHARGING_STATES } },
};

export function getSensorPropertyInput(sensorType: string, property: string): SensorPropertyInputMeta {
  return SENSOR_PROPERTY_INPUTS[sensorType as SensorType]?.[property] ?? { kind: 'text' };
}

// Initial value when a property gets enabled — booleans default to the
// "do something" state, enums to their first option.
export function getSensorPropertyDefaultValue(sensorType: string, property: string): string {
  const meta = getSensorPropertyInput(sensorType, property);
  if (meta.kind === 'boolean') return 'true';
  if (meta.kind === 'enum') return meta.options?.[0]?.value ?? '';
  return '';
}
