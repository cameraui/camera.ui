import {
  AirPurifierProperty,
  BatteryProperty,
  ChargingState,
  ContactKind,
  ContactProperty,
  CoverKind,
  CoverProperty,
  LawnMowerActivity,
  LockProperty,
  LockState,
  MediaPlayerKind,
  MediaPlayerProperty,
  MediaPlayerState,
  PresenceProperty,
  SecuritySystemProperty,
  SecuritySystemState,
  SensorDomain,
  sensorMeta,
  SensorType,
  ThermostatAction,
  ThermostatMode,
  VacuumActivity,
  VacuumProperty,
  ValveKind,
  ValveProperty,
} from '@camera.ui/sdk';
import FaceEmbedderIcon from '~icons/mdi/account-search-outline';
import AirQualityIcon from '~icons/mdi/air-filter';
import HumidifierIcon from '~icons/mdi/air-humidifier';
import HumidifierOffIcon from '~icons/mdi/air-humidifier-off';
import AirPurifierIcon from '~icons/mdi/air-purifier';
import AirPurifierOffIcon from '~icons/mdi/air-purifier-off';
import SirenIcon from '~icons/mdi/alarm-light';
import SirenOffIcon from '~icons/mdi/alarm-light-outline';
import ProblemIcon from '~icons/mdi/alert-circle-outline';
import ReceiverIcon from '~icons/mdi/audio-video';
import ReceiverOffIcon from '~icons/mdi/audio-video-off';
import AwningIcon from '~icons/mdi/awning';
import AwningClosedIcon from '~icons/mdi/awning-outline';
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
import BlindsIcon from '~icons/mdi/blinds';
import BlindsOpenIcon from '~icons/mdi/blinds-open';
import BrightnessIcon from '~icons/mdi/brightness-5';
import LicensePlateIcon from '~icons/mdi/car-search';
import BinaryIcon from '~icons/mdi/checkbox-blank-circle-outline';
import BinaryActiveIcon from '~icons/mdi/checkbox-marked-circle-outline';
import ObjectAssistIcon from '~icons/mdi/cube-outline';
import ObjectIcon from '~icons/mdi/cube-scan';
import CurtainsIcon from '~icons/mdi/curtains';
import CurtainsClosedIcon from '~icons/mdi/curtains-closed';
import DoorClosedIcon from '~icons/mdi/door-closed';
import DoorOpenIcon from '~icons/mdi/door-open';
import DoorbellIcon from '~icons/mdi/doorbell';
import FaceIcon from '~icons/mdi/face-recognition';
import FanIcon from '~icons/mdi/fan';
import FanOffIcon from '~icons/mdi/fan-off';
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
import DamperIcon from '~icons/mdi/hvac';
import DamperClosedIcon from '~icons/mdi/hvac-off';
import ClipIcon from '~icons/mdi/image-search-outline';
import ClassifierIcon from '~icons/mdi/label-multiple-outline';
import LightOnIcon from '~icons/mdi/lightbulb-on';
import LightIcon from '~icons/mdi/lightbulb-outline';
import LockedIcon from '~icons/mdi/lock';
import LockAlertIcon from '~icons/mdi/lock-alert';
import UnlockedIcon from '~icons/mdi/lock-open-outline';
import DisplayActiveIcon from '~icons/mdi/message-text';
import DisplayIcon from '~icons/mdi/message-text-outline';
import CoIcon from '~icons/mdi/molecule-co';
import Co2Icon from '~icons/mdi/molecule-co2';
import MotionIcon from '~icons/mdi/motion-sensor';
import SceneActiveIcon from '~icons/mdi/palette';
import SceneIcon from '~icons/mdi/palette-outline';
import OutletOnIcon from '~icons/mdi/power-plug';
import PowerOffIcon from '~icons/mdi/power-plug-off-outline';
import PowerIcon from '~icons/mdi/power-plug-outline';
import OutletIcon from '~icons/mdi/power-socket-eu';
import ProjectorIcon from '~icons/mdi/projector';
import ProjectorOffIcon from '~icons/mdi/projector-off';
import LawnMowerIcon from '~icons/mdi/robot-mower';
import LawnMowerOffIcon from '~icons/mdi/robot-mower-outline';
import VacuumIcon from '~icons/mdi/robot-vacuum';
import VacuumAlertIcon from '~icons/mdi/robot-vacuum-alert';
import VacuumOffIcon from '~icons/mdi/robot-vacuum-off';
import ShadeIcon from '~icons/mdi/roller-shade';
import ShadeClosedIcon from '~icons/mdi/roller-shade-closed';
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
import SpeakerIcon from '~icons/mdi/speaker';
import SpeakerOffIcon from '~icons/mdi/speaker-off';
import SprinklerIcon from '~icons/mdi/sprinkler';
import SprinklerOnIcon from '~icons/mdi/sprinkler-variant';
import TelevisionIcon from '~icons/mdi/television';
import TelevisionOffIcon from '~icons/mdi/television-off';
import TemperatureIcon from '~icons/mdi/thermometer';
import ThermostatIcon from '~icons/mdi/thermostat';
import SwitchOnIcon from '~icons/mdi/toggle-switch';
import SwitchIcon from '~icons/mdi/toggle-switch-off-outline';
import ValveIcon from '~icons/mdi/valve-closed';
import ValveOpenIcon from '~icons/mdi/valve-open';
import SegmenterIcon from '~icons/mdi/vector-polygon';
import VibrationIcon from '~icons/mdi/vibrate';
import PersonEmbedderIcon from '~icons/mdi/walk';
import LeakAlertIcon from '~icons/mdi/water-alert';
import WaterBoilerIcon from '~icons/mdi/water-boiler';
import WaterBoilerOffIcon from '~icons/mdi/water-boiler-off';
import LeakIcon from '~icons/mdi/water-off';
import HumidityIcon from '~icons/mdi/water-percent';
import AudioIcon from '~icons/mdi/waveform';
import WindowClosedIcon from '~icons/mdi/window-closed';
import GlassIcon from '~icons/mdi/window-closed-variant';
import WindowOpenIcon from '~icons/mdi/window-open';
import WindowShutterIcon from '~icons/mdi/window-shutter';
import WindowShutterOpenIcon from '~icons/mdi/window-shutter-open';

import { shownValue } from '@/common/units.js';
import { i18n } from '@/i18n/index.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { SensorClimate, SensorHumidifier, SensorPropertySpec, SensorSemantics } from '@camera.ui/sdk';
import type { Component } from 'vue';

export type Tone = 'alarm' | 'warn' | 'ok' | 'info' | 'light' | 'night';

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
  night: '139, 92, 246',
};

const SECURITY_TONES: Partial<Record<SecuritySystemState, Tone>> = {
  [SecuritySystemState.StayArm]: 'ok',
  [SecuritySystemState.AwayArm]: 'info',
  [SecuritySystemState.NightArm]: 'night',
  [SecuritySystemState.AlarmTriggered]: 'alarm',
};

const DOMAIN_LOOKS: Record<SensorDomain, SensorLook> = {
  [SensorDomain.Binary]: { icon: BinaryIcon, activeIcon: BinaryActiveIcon, states: ['clear', 'detected'], tone: 'warn' },
  [SensorDomain.Measurement]: { icon: MeasurementIcon },
  [SensorDomain.Switch]: { icon: SwitchIcon, activeIcon: SwitchOnIcon, states: ['off', 'on'], tone: 'ok' },
  [SensorDomain.Light]: { icon: LightIcon, activeIcon: LightOnIcon, states: ['off', 'on'], tone: 'light' },
  [SensorDomain.Siren]: { icon: SirenOffIcon, activeIcon: SirenIcon, states: ['off', 'on'], tone: 'alarm' },
  [SensorDomain.Lock]: { icon: UnlockedIcon, activeIcon: LockedIcon, states: ['unlocked', 'locked'], tone: 'ok' },
  [SensorDomain.Cover]: { icon: WindowShutterIcon, activeIcon: WindowShutterOpenIcon, states: ['closed', 'open'], tone: 'warn' },
  [SensorDomain.Climate]: { icon: ThermostatIcon, states: ['off', 'on'], tone: 'warn' },
  [SensorDomain.Fan]: { icon: FanOffIcon, activeIcon: FanIcon, states: ['off', 'on'], tone: 'info' },
  [SensorDomain.Valve]: { icon: ValveIcon, activeIcon: ValveOpenIcon, states: ['closed', 'open'], tone: 'info' },
  [SensorDomain.Scene]: { icon: SceneIcon, activeIcon: SceneActiveIcon, states: ['ready', 'running'], tone: 'info' },
  [SensorDomain.Humidifier]: { icon: HumidifierOffIcon, activeIcon: HumidifierIcon, states: ['off', 'on'], tone: 'info' },
  [SensorDomain.AirPurifier]: { icon: AirPurifierOffIcon, activeIcon: AirPurifierIcon, states: ['off', 'on'], tone: 'info' },
  [SensorDomain.WaterHeater]: { icon: WaterBoilerOffIcon, activeIcon: WaterBoilerIcon, states: ['off', 'on'], tone: 'warn' },
  [SensorDomain.Vacuum]: { icon: VacuumOffIcon, activeIcon: VacuumIcon, states: ['docked', 'cleaning'], tone: 'info' },
  [SensorDomain.LawnMower]: { icon: LawnMowerOffIcon, activeIcon: LawnMowerIcon, states: ['docked', 'mowing'], tone: 'ok' },
  [SensorDomain.MediaPlayer]: { icon: TelevisionOffIcon, activeIcon: TelevisionIcon, states: ['off', 'on'], tone: 'info' },
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
  [SensorType.Presence]: { icon: EmptyIcon, activeIcon: OccupiedIcon, states: ['away', 'home'], tone: 'info' },
  [SensorType.Outlet]: { icon: OutletIcon, activeIcon: OutletOnIcon },
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

const NAMED_STATE_DOMAINS = new Set<SensorDomain>([SensorDomain.Alarm, SensorDomain.Cover, SensorDomain.Valve]);
const ROBOT_TYPES = new Set<string>([SensorType.Vacuum, SensorType.LawnMower]);

const VALVE_KIND_ICONS: Partial<Record<ValveKind, readonly [closed: Component, open: Component]>> = {
  [ValveKind.Irrigation]: [SprinklerIcon, SprinklerOnIcon],
};

const MEDIA_PLAYER_KIND_ICONS: Record<MediaPlayerKind, readonly [off: Component, on: Component]> = {
  [MediaPlayerKind.Tv]: [TelevisionOffIcon, TelevisionIcon],
  [MediaPlayerKind.Speaker]: [SpeakerOffIcon, SpeakerIcon],
  [MediaPlayerKind.Receiver]: [ReceiverOffIcon, ReceiverIcon],
  [MediaPlayerKind.Projector]: [ProjectorOffIcon, ProjectorIcon],
};

const COVER_KIND_ICONS: Record<CoverKind, readonly [closed: Component, open: Component]> = {
  [CoverKind.Awning]: [AwningClosedIcon, AwningIcon],
  [CoverKind.Blind]: [BlindsIcon, BlindsOpenIcon],
  [CoverKind.Curtain]: [CurtainsClosedIcon, CurtainsIcon],
  [CoverKind.Damper]: [DamperClosedIcon, DamperIcon],
  [CoverKind.Door]: [DoorClosedIcon, DoorOpenIcon],
  [CoverKind.Shade]: [ShadeClosedIcon, ShadeIcon],
  [CoverKind.Shutter]: [WindowShutterIcon, WindowShutterOpenIcon],
  [CoverKind.Window]: [WindowClosedIcon, WindowOpenIcon],
};

const CONTACT_KIND_ICONS: Record<ContactKind, readonly [closed: Component, open: Component]> = {
  [ContactKind.Door]: [DoorClosedIcon, DoorOpenIcon],
  [ContactKind.GarageDoor]: [GarageIcon, GarageOpenIcon],
  [ContactKind.Window]: [WindowClosedIcon, WindowOpenIcon],
};

const DETECTION_STATES = ['idle', 'detected'] as const;

export function sensorTypeIcon(type: string, active = false): Component {
  const look = lookOf(type);
  return active && look.activeIcon ? look.activeIcon : look.icon;
}

export function sensorIcon(type: string, sensor: AnySensor | undefined): Component {
  if (type === SensorType.Battery) return batteryIcon(sensor);
  if (type === SensorType.SecuritySystem) return securityIcon(sensor);
  const active = sensor ? sensorActive(type, readFrom(sensor)) : false;
  if (type === SensorType.Lock && sensor?.getProperty(LockProperty.CurrentState) === LockState.Jammed) return LockAlertIcon;
  if (type === SensorType.Vacuum && sensor?.getProperty(VacuumProperty.Activity) === VacuumActivity.Error) return VacuumAlertIcon;
  const kindIcons = kindIconsOf(type, sensor);
  return kindIcons ? kindIcons[active ? 1 : 0] : sensorTypeIcon(type, active);
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
    case SensorDomain.Valve:
      return requested(semantics, read) === semantics.states?.open;
    case SensorDomain.Climate:
    case SensorDomain.WaterHeater: {
      const mode = read(semantics.stateProperty);
      return mode !== undefined && mode !== ThermostatMode.Off;
    }
    case SensorDomain.Vacuum:
      return read(semantics.stateProperty) === VacuumActivity.Cleaning;
    case SensorDomain.LawnMower:
      return read(semantics.stateProperty) === LawnMowerActivity.Mowing;
    case SensorDomain.MediaPlayer: {
      const state = read(semantics.stateProperty);
      return state !== undefined && state !== MediaPlayerState.Off;
    }
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
  return active && tone ? toneColor(tone) : undefined;
}

export function toneColor(tone: Tone): string {
  return `rgb(${TONES[tone]})`;
}

export function securityColor(state: unknown): string | undefined {
  const tone = SECURITY_TONES[state as SecuritySystemState];
  return tone && toneColor(tone);
}

export function sensorTone(type: string, sensor: AnySensor | undefined): Record<string, string> {
  return sensor ? sensorReadTone(type, readFrom(sensor)) : toneStyle(undefined);
}

export function sensorReadTone(type: string, read: ReadProperty): Record<string, string> {
  if (type === SensorType.SecuritySystem) return toneStyle(SECURITY_TONES[shownSecurityState(read) as SecuritySystemState]);
  if (read(sensorMeta(type)?.semantics?.climate?.action ?? '') === ThermostatAction.Cooling) return toneStyle('info');
  if (type === SensorType.Lock && read(LockProperty.CurrentState) === LockState.Jammed) return toneStyle('alarm');
  if ((type === SensorType.Cover || type === SensorType.Garage) && read(CoverProperty.ObstructionDetected) === true) return toneStyle('alarm');
  if (ROBOT_TYPES.has(type) && read(VacuumProperty.Activity) === VacuumActivity.Error) return toneStyle('alarm');
  return toneStyle(sensorActive(type, read) ? lookOf(type).tone : undefined);
}

export function sensorStateKey(type: string, active: boolean): string {
  const states = lookOf(type).states ?? DETECTION_STATES;
  return `components.sensor_state.${states[active ? 1 : 0]}`;
}

export function sensorStatus(type: string, sensor: AnySensor | undefined, t: (key: string) => string): string {
  const semantics = sensorMeta(type)?.semantics;
  const value = sensor && semantics ? sensor.getProperty(semantics.stateProperty) : undefined;
  const zone = type === SensorType.Presence && value === false ? sensor?.getProperty(PresenceProperty.Zone) : undefined;
  if (typeof zone === 'string' && zone) return zone;
  if (semantics?.domain === SensorDomain.Measurement) return sensorReading(sensor) ?? namedState(value, t) ?? '--';
  if (semantics?.domain === SensorDomain.Event) return namedState(value, t) ?? t('components.sensor_state.idle');
  if (semantics?.domain === SensorDomain.Text) return typeof value === 'string' && value ? value : '--';
  if (sensor && semantics?.climate) return climateStatus(sensor, semantics.climate, t);
  if (sensor && semantics?.humidifier) return humidifierStatus(sensor, semantics.humidifier, value === true, t);
  if (sensor && semantics?.domain === SensorDomain.AirPurifier) return purifierStatus(sensor, value === true, t);
  if (sensor && ROBOT_TYPES.has(type)) return valueName(sensor, VacuumProperty.Activity, t) ?? '--';
  if (sensor && type === SensorType.MediaPlayer) return mediaPlayerStatus(sensor, t);
  if (type === SensorType.Lock && sensor?.getProperty(LockProperty.CurrentState) === LockState.Jammed) return t('components.sensor_state.jammed');
  const speed = semantics?.fan?.speed;
  if (sensor && speed && value === true && sensorOffers(sensor, speed)) {
    return `${t('components.sensor_state.on')} · ${formatMeasurement(Number(sensor.getProperty(speed)), sensorPropertySpec(sensor, speed))}`;
  }
  if (sensor && semantics?.states && NAMED_STATE_DOMAINS.has(semantics.domain)) {
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

export function sensorPropertyLabelKey(type: string, property: string): string {
  // a type can name a shared property its own way, an air quality level is no battery level
  const own = `sensor_property_${type}_${property}`;
  return i18n.global.te(`components.automation_nodes.${own}`) ? own : `sensor_property_${property}`;
}

export function sensorValueLabel(type: string, property: string, value: unknown, spec: SensorPropertySpec | undefined): string {
  if (value === null || value === undefined || value === '') return '–';
  const { t, te } = i18n.global;
  if (typeof value === 'boolean') {
    const isState = property === (sensorMeta(type)?.semantics?.stateProperty ?? 'detected');
    return t(isState ? sensorStateKey(type, value) : `components.sensor_state.${value ? 'on' : 'off'}`);
  }
  if (typeof value === 'number' && spec?.type === 'number') return formatMeasurement(value, spec);
  const choice = spec?.choices?.find((entry) => entry.value === value);
  if (choice) return choice.label;
  const name = spec?.type === 'enum' ? Object.entries(spec.values ?? {}).find(([, wire]) => wire === value)?.[0] : undefined;
  const key = name ? `components.automation_nodes.${type}_state_${name}` : '';
  return key && te(key) ? t(key) : String(value);
}

export function formatMeasurement(value: number, spec: SensorPropertySpec | undefined, fallbackDecimals?: number): string {
  const shown = shownValue(value, spec?.unit);
  const decimals = spec?.step ? decimalsOf(spec.step) : (fallbackDecimals ?? (Number.isInteger(shown.value) ? 0 : 1));
  const text = shown.value.toFixed(decimals);
  return shown.unit ? `${text} ${shown.unit}` : text;
}

export function sensorOffers(sensor: AnySensor, property: string): boolean {
  const meta = sensorMeta(sensor.type);
  const capability = meta?.propertyCapabilities?.[property];
  return !!meta && property in meta.properties && (!capability || sensor.hasCapability(capability));
}

export function sensorPropertySpec(sensor: AnySensor, property: string): SensorPropertySpec | undefined {
  return sensor.propertySpecs.value[property] ?? sensorMeta(sensor.type)?.properties[property];
}

export function decimalsOf(step: number): number {
  const [, fraction = ''] = String(step).split('.');
  return fraction.length;
}

function lookOf(type: string): SensorLook {
  const domain = sensorMeta(type)?.semantics?.domain;
  const base = domain ? DOMAIN_LOOKS[domain] : { icon: UnknownIcon };
  return { ...base, ...TYPE_LOOKS[type as SensorType] };
}

function kindIconsOf(type: string, sensor: AnySensor | undefined): readonly [Component, Component] | undefined {
  if (type === SensorType.Cover) return COVER_KIND_ICONS[sensor?.getProperty(CoverProperty.Kind) as CoverKind];
  if (type === SensorType.Contact) return CONTACT_KIND_ICONS[sensor?.getProperty(ContactProperty.Kind) as ContactKind];
  if (type === SensorType.Valve) return VALVE_KIND_ICONS[sensor?.getProperty(ValveProperty.Kind) as ValveKind];
  if (type === SensorType.MediaPlayer) return MEDIA_PLAYER_KIND_ICONS[sensor?.getProperty(MediaPlayerProperty.Kind) as MediaPlayerKind];
  return undefined;
}

function climateStatus(sensor: AnySensor, climate: SensorClimate, t: (key: string) => string): string {
  const { action, humidity } = climate;
  const doing = action && sensorOffers(sensor, action) ? valueName(sensor, action, t) : undefined;
  const wet = humidity && sensorOffers(sensor, humidity) ? propertyReading(sensor, humidity) : undefined;
  return [propertyReading(sensor, climate.current), doing ?? valueName(sensor, climate.mode, t), wet].filter(Boolean).join(' · ') || '--';
}

function humidifierStatus(sensor: AnySensor, humidifier: SensorHumidifier, on: boolean, t: (key: string) => string): string {
  const { action, current } = humidifier;
  const doing = on && action && sensorOffers(sensor, action) ? valueName(sensor, action, t) : undefined;
  const reading = current && sensorOffers(sensor, current) ? propertyReading(sensor, current) : undefined;
  return [doing ?? t(`components.sensor_state.${on ? 'on' : 'off'}`), reading].filter(Boolean).join(' · ');
}

function purifierStatus(sensor: AnySensor, on: boolean, t: (key: string) => string): string {
  const doing = on && sensorOffers(sensor, AirPurifierProperty.State) ? valueName(sensor, AirPurifierProperty.State, t) : undefined;
  const speed = on && sensorOffers(sensor, AirPurifierProperty.Speed) ? propertyReading(sensor, AirPurifierProperty.Speed) : undefined;
  const filter = sensor.getProperty(AirPurifierProperty.FilterChange) === true ? t('components.sensor_state.change_filter') : undefined;
  return [doing ?? t(`components.sensor_state.${on ? 'on' : 'off'}`), speed, filter].filter(Boolean).join(' · ');
}

function mediaPlayerStatus(sensor: AnySensor, t: (key: string) => string): string {
  const state = valueName(sensor, MediaPlayerProperty.State, t) ?? '--';
  if (sensor.getProperty(MediaPlayerProperty.State) === MediaPlayerState.Off) return state;
  const playing = [MediaPlayerProperty.Title, MediaPlayerProperty.Artist].flatMap((property) => {
    const value = sensor.getProperty(property);
    return sensorOffers(sensor, property) && typeof value === 'string' && value ? [value] : [];
  });
  return [state, ...playing].join(' · ');
}

function valueName(sensor: AnySensor, property: string, t: (key: string) => string): string | undefined {
  const value = sensor.getProperty(property);
  return typeof value === 'string' && value ? t(`components.automation_nodes.${sensor.type}_state_${value}`) : undefined;
}

function propertyReading(sensor: AnySensor, property: string): string | undefined {
  const value = sensor.getProperty(property);
  return typeof value === 'number' ? formatMeasurement(value, sensorPropertySpec(sensor, property)) : undefined;
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

function shownSecurityState(read: ReadProperty): unknown {
  const current = read(SecuritySystemProperty.CurrentState);
  return current === SecuritySystemState.AlarmTriggered ? current : (read(SecuritySystemProperty.TargetState) ?? current);
}

function requested(semantics: SensorSemantics, read: ReadProperty): unknown {
  return read(semantics.commandProperty) ?? read(semantics.stateProperty);
}

function securityIcon(sensor: AnySensor | undefined): Component {
  switch (sensor && shownSecurityState(readFrom(sensor))) {
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
