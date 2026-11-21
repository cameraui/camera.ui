import { BatteryProperty, ChargingState, SecuritySystemProperty, SecuritySystemState, SensorDomain, SensorType, sensorMeta } from '@camera.ui/sdk';
import FaceEmbedderIcon from '~icons/mdi/account-search-outline';
import AirQualityIcon from '~icons/mdi/air-filter';
import SirenIcon from '~icons/mdi/alarm-light';
import SirenOffIcon from '~icons/mdi/alarm-light-outline';
import ProblemIcon from '~icons/mdi/alert-circle-outline';
import Battery100Icon from '~icons/mdi/battery';
import Battery20Icon from '~icons/mdi/battery-20';
import Battery40Icon from '~icons/mdi/battery-40';
import Battery60Icon from '~icons/mdi/battery-60';
import BatteryIcon from '~icons/mdi/battery-70';
import Battery80Icon from '~icons/mdi/battery-80';
import BatteryCharging100Icon from '~icons/mdi/battery-charging-100';
import BatteryCharging20Icon from '~icons/mdi/battery-charging-20';
import BatteryCharging40Icon from '~icons/mdi/battery-charging-40';
import BatteryCharging60Icon from '~icons/mdi/battery-charging-60';
import BatteryCharging80Icon from '~icons/mdi/battery-charging-80';
import BatteryEmptyIcon from '~icons/mdi/battery-outline';
import ChimeIcon from '~icons/mdi/bell-outline';
import ChimeRingIcon from '~icons/mdi/bell-ring';
import BrightnessIcon from '~icons/mdi/brightness-5';
import LicensePlateIcon from '~icons/mdi/car-search';
import BinaryIcon from '~icons/mdi/checkbox-blank-circle-outline';
import BinaryActiveIcon from '~icons/mdi/checkbox-marked-circle-outline';
import ObjectAssistIcon from '~icons/mdi/cube-outline';
import ObjectIcon from '~icons/mdi/cube-scan';
import DoorClosedIcon from '~icons/mdi/door-closed';
import DoorOpenIcon from '~icons/mdi/door-open';
import DoorbellIcon from '~icons/mdi/doorbell';
import FaceIcon from '~icons/mdi/face-recognition';
import AccessIcon from '~icons/mdi/fingerprint';
import FireIcon from '~icons/mdi/fire';
import GarageOpenIcon from '~icons/mdi/garage-open-variant';
import GarageIcon from '~icons/mdi/garage-variant';
import GasIcon from '~icons/mdi/gas-cylinder';
import MeasurementIcon from '~icons/mdi/gauge';
import ButtonIcon from '~icons/mdi/gesture-tap-button';
import GlassBreakIcon from '~icons/mdi/glass-fragile';
import UnknownIcon from '~icons/mdi/help-circle-outline';
import OccupiedIcon from '~icons/mdi/home-account';
import EmptyIcon from '~icons/mdi/home-outline';
import ClipIcon from '~icons/mdi/image-search-outline';
import ClassifierIcon from '~icons/mdi/label-multiple-outline';
import LightOnIcon from '~icons/mdi/lightbulb-on';
import LightIcon from '~icons/mdi/lightbulb-outline';
import LockedIcon from '~icons/mdi/lock';
import UnlockedIcon from '~icons/mdi/lock-open-outline';
import DisplayActiveIcon from '~icons/mdi/message-text';
import DisplayIcon from '~icons/mdi/message-text-outline';
import CoIcon from '~icons/mdi/molecule-co';
import Co2Icon from '~icons/mdi/molecule-co2';
import MotionIcon from '~icons/mdi/motion-sensor';
import PowerOffIcon from '~icons/mdi/power-plug-off-outline';
import PowerIcon from '~icons/mdi/power-plug-outline';
import PtzIcon from '~icons/mdi/rotate-orbit';
import ShieldAlertIcon from '~icons/mdi/shield-alert';
import TamperIcon from '~icons/mdi/shield-alert-outline';
import ShieldHomeIcon from '~icons/mdi/shield-home';
import SecuritySystemIcon from '~icons/mdi/shield-home-outline';
import ShieldLockIcon from '~icons/mdi/shield-lock';
import ShieldMoonIcon from '~icons/mdi/shield-moon';
import ShieldOffIcon from '~icons/mdi/shield-off-outline';
import SmokeIcon from '~icons/mdi/smoke-detector-variant';
import SmokeAlertIcon from '~icons/mdi/smoke-detector-variant-alert';
import ColdIcon from '~icons/mdi/snowflake';
import TemperatureIcon from '~icons/mdi/thermometer';
import SwitchOnIcon from '~icons/mdi/toggle-switch';
import SwitchIcon from '~icons/mdi/toggle-switch-off-outline';
import SegmenterIcon from '~icons/mdi/vector-polygon';
import VibrationIcon from '~icons/mdi/vibrate';
import PersonEmbedderIcon from '~icons/mdi/walk';
import LeakAlertIcon from '~icons/mdi/water-alert';
import LeakIcon from '~icons/mdi/water-off';
import HumidityIcon from '~icons/mdi/water-percent';
import AudioIcon from '~icons/mdi/waveform';
import GlassIcon from '~icons/mdi/window-closed-variant';
import WindowShutterIcon from '~icons/mdi/window-shutter';
import WindowShutterOpenIcon from '~icons/mdi/window-shutter-open';

import { i18n } from '@/i18n/index.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { SensorPropertySpec, SensorSemantics } from '@camera.ui/sdk';
import type { Component } from 'vue';

type Tone = 'alarm' | 'warn' | 'ok' | 'info' | 'light';
type ReadProperty = (property: string) => unknown;
type AnySensor = ReactiveSensor<object>;

interface SensorLook {
  icon: Component;
  activeIcon?: Component;
  states?: readonly [idle: string, active: string];
  tone?: Tone;
}

const TONES: Record<Tone, string> = {
  alarm: '239, 68, 68',
  warn: '251, 146, 60',
  ok: '34, 197, 94',
  info: '59, 130, 246',
  light: '250, 204, 21',
};

const DOMAIN_LOOKS: Record<SensorDomain, SensorLook> = {
  [SensorDomain.Binary]: { icon: BinaryIcon, activeIcon: BinaryActiveIcon, states: ['clear', 'detected'], tone: 'warn' },
  [SensorDomain.Measurement]: { icon: MeasurementIcon },
  [SensorDomain.Switch]: { icon: SwitchIcon, activeIcon: SwitchOnIcon, states: ['off', 'on'], tone: 'ok' },
  [SensorDomain.Light]: { icon: LightIcon, activeIcon: LightOnIcon, states: ['off', 'on'], tone: 'light' },
  [SensorDomain.Siren]: { icon: SirenOffIcon, activeIcon: SirenIcon, states: ['off', 'on'], tone: 'alarm' },
  [SensorDomain.Lock]: { icon: UnlockedIcon, activeIcon: LockedIcon, states: ['unlocked', 'locked'], tone: 'ok' },
  [SensorDomain.Cover]: { icon: WindowShutterIcon, activeIcon: WindowShutterOpenIcon, states: ['closed', 'open'], tone: 'warn' },
  [SensorDomain.Alarm]: { icon: SecuritySystemIcon, states: ['disarmed', 'armed_home'], tone: 'ok' },
  [SensorDomain.Event]: { icon: ButtonIcon, tone: 'info' },
  [SensorDomain.Text]: { icon: DisplayIcon, activeIcon: DisplayActiveIcon, tone: 'info' },
};

const TYPE_LOOKS: Partial<Record<SensorType, Partial<SensorLook>>> = {
  [SensorType.Motion]: { icon: MotionIcon, tone: 'warn' },
  [SensorType.Object]: { icon: ObjectIcon, tone: 'warn' },
  [SensorType.Audio]: { icon: AudioIcon, tone: 'warn' },
  [SensorType.Face]: { icon: FaceIcon, tone: 'warn' },
  [SensorType.LicensePlate]: { icon: LicensePlateIcon, tone: 'warn' },
  [SensorType.Classifier]: { icon: ClassifierIcon, tone: 'warn' },
  [SensorType.FaceEmbedder]: { icon: FaceEmbedderIcon },
  [SensorType.PersonEmbedder]: { icon: PersonEmbedderIcon },
  [SensorType.Segmenter]: { icon: SegmenterIcon },
  [SensorType.Clip]: { icon: ClipIcon },
  [SensorType.ObjectAssist]: { icon: ObjectAssistIcon },
  [SensorType.PTZ]: { icon: PtzIcon },
  [SensorType.Contact]: { icon: DoorClosedIcon, activeIcon: DoorOpenIcon, states: ['closed', 'open'] },
  [SensorType.Occupancy]: { icon: EmptyIcon, activeIcon: OccupiedIcon, states: ['empty', 'occupied'], tone: 'info' },
  [SensorType.Smoke]: { icon: SmokeIcon, activeIcon: SmokeAlertIcon, states: ['no_smoke', 'smoke'], tone: 'alarm' },
  [SensorType.Leak]: { icon: LeakIcon, activeIcon: LeakAlertIcon, states: ['no_leak', 'leak'], tone: 'info' },
  [SensorType.Gas]: { icon: GasIcon, activeIcon: GasIcon, tone: 'alarm' },
  [SensorType.CarbonMonoxide]: { icon: CoIcon, activeIcon: CoIcon, tone: 'alarm' },
  [SensorType.Heat]: { icon: FireIcon, activeIcon: FireIcon, tone: 'alarm' },
  [SensorType.Cold]: { icon: ColdIcon, activeIcon: ColdIcon, tone: 'info' },
  [SensorType.Vibration]: { icon: VibrationIcon, activeIcon: VibrationIcon },
  [SensorType.Tamper]: { icon: TamperIcon, activeIcon: TamperIcon, tone: 'alarm' },
  [SensorType.Problem]: { icon: ProblemIcon, activeIcon: ProblemIcon },
  [SensorType.Power]: { icon: PowerOffIcon, activeIcon: PowerIcon, states: ['off', 'on'], tone: 'ok' },
  [SensorType.Doorbell]: { icon: DoorbellIcon, activeIcon: DoorbellIcon, states: ['ready', 'ringing'], tone: 'info' },
  [SensorType.Garage]: { icon: GarageIcon, activeIcon: GarageOpenIcon },
  [SensorType.GlassBreak]: { icon: GlassIcon, activeIcon: GlassBreakIcon, states: ['clear', 'glass_break'], tone: 'alarm' },
  [SensorType.Access]: { icon: AccessIcon, tone: 'ok' },
  [SensorType.Chime]: { icon: ChimeIcon, activeIcon: ChimeRingIcon, states: ['off', 'ringing'], tone: 'info' },
  [SensorType.AirQuality]: { icon: AirQualityIcon },
  [SensorType.Temperature]: { icon: TemperatureIcon },
  [SensorType.Humidity]: { icon: HumidityIcon },
  [SensorType.Illuminance]: { icon: BrightnessIcon },
  [SensorType.CarbonDioxide]: { icon: Co2Icon },
  [SensorType.Battery]: { icon: BatteryIcon, tone: 'alarm' },
};

const DETECTION_STATES = ['idle', 'detected'] as const;

export function sensorTypeIcon(type: string, active = false): Component {
  const look = lookOf(type);
  return active && look.activeIcon ? look.activeIcon : look.icon;
}

export function sensorIcon(type: string, sensor: AnySensor | undefined): Component {
  if (type === SensorType.Battery) return batteryIcon(sensor);
  if (type === SensorType.SecuritySystem) return securityIcon(sensor);
  return sensorTypeIcon(type, sensor ? sensorActive(type, readFrom(sensor)) : false);
}

export function sensorActive(type: string, read: ReadProperty): boolean {
  if (type === SensorType.Battery) return read(BatteryProperty.Low) === true;
  const meta = sensorMeta(type);
  const semantics = meta?.semantics;
  if (!semantics) return meta?.isDetectionType === true && read('detected') === true;

  switch (semantics.domain) {
    case SensorDomain.Measurement:
      return false;
    case SensorDomain.Lock:
      return requested(semantics, read) === semantics.states?.locked;
    case SensorDomain.Cover:
      return requested(semantics, read) === semantics.states?.open;
    case SensorDomain.Alarm: {
      const state = requested(semantics, read);
      return state !== undefined && state !== semantics.states?.disarmed;
    }
    case SensorDomain.Event:
    case SensorDomain.Text:
      return Boolean(read(semantics.stateProperty));
    default:
      return read(semantics.stateProperty) === true;
  }
}

export function isSensorActive(sensor: AnySensor | undefined): boolean {
  return sensor ? sensorActive(sensor.type, readFrom(sensor)) : false;
}

export function sensorToneColor(type: string, active: boolean): string | undefined {
  const tone = lookOf(type).tone;
  return active && tone ? `rgb(${TONES[tone]})` : undefined;
}

export function sensorTone(type: string, sensor: AnySensor | undefined): Record<string, string> {
  return sensor ? sensorReadTone(type, readFrom(sensor)) : toneStyle(undefined);
}

export function sensorReadTone(type: string, read: ReadProperty): Record<string, string> {
  if (type === SensorType.SecuritySystem && read(SecuritySystemProperty.CurrentState) === SecuritySystemState.AlarmTriggered) return toneStyle('alarm');
  return toneStyle(sensorActive(type, read) ? lookOf(type).tone : undefined);
}

export function sensorStateKey(type: string, active: boolean): string {
  const states = lookOf(type).states ?? DETECTION_STATES;
  return `components.sensor_state.${states[active ? 1 : 0]}`;
}

export function sensorStatus(type: string, sensor: AnySensor | undefined, t: (key: string) => string): string {
  const semantics = sensorMeta(type)?.semantics;
  const value = sensor && semantics ? sensor.getProperty(semantics.stateProperty) : undefined;
  if (semantics?.domain === SensorDomain.Measurement) return sensorReading(sensor) ?? namedState(value, t) ?? '--';
  if (semantics?.domain === SensorDomain.Event) return namedState(value, t) ?? t('components.sensor_state.idle');
  if (semantics?.domain === SensorDomain.Text) return typeof value === 'string' && value ? value : '--';
  if (sensor && semantics?.states && (semantics.domain === SensorDomain.Alarm || semantics.domain === SensorDomain.Cover)) {
    const value = sensor.getProperty(semantics.stateProperty);
    const name = Object.entries(semantics.states).find(([, state]) => state === value)?.[0];
    if (name) return t(`components.sensor_state.${name}`);
  }
  return t(sensorStateKey(type, sensor ? sensorActive(type, readFrom(sensor)) : false));
}

export function sensorReading(sensor: AnySensor | undefined): string | undefined {
  const semantics = sensor ? sensorMeta(sensor.type)?.semantics : undefined;
  if (!sensor || semantics?.domain !== SensorDomain.Measurement) return undefined;
  const value = sensor.getProperty(semantics.stateProperty);
  return typeof value === 'number' ? formatMeasurement(value, sensorPropertySpec(sensor, semantics.stateProperty)) : undefined;
}

export function sensorReadings(sensor: AnySensor, t: (key: string) => string): string | undefined {
  const meta = sensorMeta(sensor.type);
  const readings = (meta?.semantics?.readings ?? []).flatMap(({ property }) => {
    const capability = meta?.propertyCapabilities?.[property];
    const value = sensor.getProperty(property);
    if ((capability && !sensor.hasCapability(capability)) || typeof value !== 'number') return [];
    return [`${t(`components.automation_nodes.sensor_property_${property}`)} ${formatMeasurement(value, sensorPropertySpec(sensor, property))}`];
  });
  return readings.length ? readings.join(' · ') : undefined;
}

export function sensorPropertyLabelKey(type: string, property: string): string {
  // a type can name a shared property its own way, an air quality level is no battery level
  const own = `sensor_property_${type}_${property}`;
  return i18n.global.te(`components.automation_nodes.${own}`) ? own : `sensor_property_${property}`;
}

export function formatMeasurement(value: number, spec: SensorPropertySpec | undefined): string {
  const decimals = spec?.step ? decimalsOf(spec.step) : Number.isInteger(value) ? 0 : 1;
  const text = value.toFixed(decimals);
  return spec?.unit ? `${text} ${spec.unit}` : text;
}

export function sensorPropertySpec(sensor: AnySensor, property: string): SensorPropertySpec | undefined {
  return sensor.propertySpecs.value[property] ?? sensorMeta(sensor.type)?.properties[property];
}

function lookOf(type: string): SensorLook {
  const domain = sensorMeta(type)?.semantics?.domain;
  const base = domain ? DOMAIN_LOOKS[domain] : { icon: UnknownIcon };
  return { ...base, ...TYPE_LOOKS[type as SensorType] };
}

function namedState(value: unknown, t: (key: string) => string): string | undefined {
  return typeof value === 'string' && value ? t(`components.sensor_state.${value}`) : undefined;
}

function toneStyle(tone: Tone | undefined): Record<string, string> {
  if (!tone) return { color: 'var(--text-secondary-color)' };
  return { color: `rgb(${TONES[tone]})`, filter: `drop-shadow(0 0 8px rgba(${TONES[tone]}, 0.7))` };
}

function readFrom(sensor: AnySensor): ReadProperty {
  return (property) => sensor.getProperty(property);
}

function requested(semantics: SensorSemantics, read: ReadProperty): unknown {
  return read(semantics.commandProperty) ?? read(semantics.stateProperty);
}

function decimalsOf(step: number): number {
  const [, fraction = ''] = String(step).split('.');
  return fraction.length;
}

function securityIcon(sensor: AnySensor | undefined): Component {
  const state = sensor?.getProperty(SecuritySystemProperty.CurrentState) ?? sensor?.getProperty(SecuritySystemProperty.TargetState);

  switch (state) {
    case SecuritySystemState.AlarmTriggered:
      return ShieldAlertIcon;
    case SecuritySystemState.StayArm:
      return ShieldHomeIcon;
    case SecuritySystemState.AwayArm:
      return ShieldLockIcon;
    case SecuritySystemState.NightArm:
      return ShieldMoonIcon;
    default:
      return ShieldOffIcon;
  }
}

function batteryIcon(sensor: AnySensor | undefined): Component {
  const reading = sensor?.getProperty(BatteryProperty.Level);
  const level = typeof reading === 'number' ? reading : 0;
  const charging = sensor?.getProperty(BatteryProperty.Charging) === ChargingState.Charging;

  if (level >= 90) return charging ? BatteryCharging100Icon : Battery100Icon;
  if (level >= 70) return charging ? BatteryCharging80Icon : Battery80Icon;
  if (level >= 50) return charging ? BatteryCharging60Icon : Battery60Icon;
  if (level >= 30) return charging ? BatteryCharging40Icon : Battery40Icon;
  if (level >= 15) return charging ? BatteryCharging20Icon : Battery20Icon;
  return BatteryEmptyIcon;
}
