import {
  isReactiveBatteryInfo,
  isReactiveContactSensor,
  isReactiveDoorbellTrigger,
  isReactiveGarageControl,
  isReactiveHumidityInfo,
  isReactiveLeakSensor,
  isReactiveLightControl,
  isReactiveLockControl,
  isReactiveOccupancySensor,
  isReactiveSecuritySystem,
  isReactiveSirenControl,
  isReactiveSmokeSensor,
  isReactiveTemperatureInfo,
} from '@camera.ui/browser';
import {
  BatteryProperty,
  ChargingState,
  ContactProperty,
  DoorbellProperty,
  GarageProperty,
  HumidityProperty,
  LeakProperty,
  LightProperty,
  LockProperty,
  OccupancyProperty,
  SecuritySystemProperty,
  SecuritySystemState,
  SensorType,
  SirenProperty,
  SmokeProperty,
  SwitchProperty,
  TemperatureProperty,
} from '@camera.ui/sdk';

import DoorClosed from '~icons/lucide/door-closed';
import DoorOpen from '~icons/lucide/door-open';
import Droplets from '~icons/lucide/droplets';
import Power from '~icons/lucide/power';
import Thermometer from '~icons/lucide/thermometer';
import Siren from '~icons/mdi/alarm-light';
import Battery100 from '~icons/mdi/battery';
import Battery20 from '~icons/mdi/battery-20';
import Battery40 from '~icons/mdi/battery-40';
import Battery60 from '~icons/mdi/battery-60';
import Battery80 from '~icons/mdi/battery-80';
import BatteryCharging100 from '~icons/mdi/battery-charging-100';
import BatteryCharging20 from '~icons/mdi/battery-charging-20';
import BatteryCharging40 from '~icons/mdi/battery-charging-40';
import BatteryCharging60 from '~icons/mdi/battery-charging-60';
import BatteryCharging80 from '~icons/mdi/battery-charging-80';
import BatteryOutline from '~icons/mdi/battery-outline';
import Doorbell from '~icons/mdi/doorbell';
import GarageOpen from '~icons/mdi/garage-open-variant';
import GarageShut from '~icons/mdi/garage-variant';
import LightbulbOn from '~icons/mdi/lightbulb-on';
import LightbulbOff from '~icons/mdi/lightbulb-outline';
import Locked from '~icons/mdi/lock';
import Unlocked from '~icons/mdi/lock-open-outline';
import MotionOn from '~icons/mdi/motion-sensor';
import MotionOff from '~icons/mdi/motion-sensor-off';
import ShieldAlert from '~icons/mdi/shield-alert';
import ShieldHome from '~icons/mdi/shield-home';
import ShieldLock from '~icons/mdi/shield-lock';
import ShieldMoon from '~icons/mdi/shield-moon';
import ShieldOff from '~icons/mdi/shield-off-outline';
import SmokeOn from '~icons/mdi/smoke-detector-variant';
import SmokeOff from '~icons/mdi/smoke-detector-variant-off';
import WaterAlert from '~icons/mdi/water-alert';
import WaterOff from '~icons/mdi/water-off';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

const ACTIVE_TONES: Record<string, { color: string; glow: string }> = {
  light: { color: 'rgb(250, 204, 21)', glow: 'rgba(250, 204, 21, 0.8)' },
  siren: { color: 'rgb(239, 68, 68)', glow: 'rgba(239, 68, 68, 0.8)' },
  switch: { color: 'rgb(34, 197, 94)', glow: 'rgba(34, 197, 94, 0.7)' },
  contact: { color: 'rgb(251, 146, 60)', glow: 'rgba(251, 146, 60, 0.6)' },
  lock: { color: 'rgb(34, 197, 94)', glow: 'rgba(34, 197, 94, 0.7)' },
  garage: { color: 'rgb(251, 146, 60)', glow: 'rgba(251, 146, 60, 0.6)' },
  occupancy: { color: 'rgb(59, 130, 246)', glow: 'rgba(59, 130, 246, 0.7)' },
  smoke: { color: 'rgb(239, 68, 68)', glow: 'rgba(239, 68, 68, 0.8)' },
  leak: { color: 'rgb(59, 130, 246)', glow: 'rgba(59, 130, 246, 0.8)' },
  doorbell: { color: 'rgb(59, 130, 246)', glow: 'rgba(59, 130, 246, 0.8)' },
  securitySystem: { color: 'rgb(34, 197, 94)', glow: 'rgba(34, 197, 94, 0.7)' },
  battery: { color: 'rgb(239, 68, 68)', glow: 'rgba(239, 68, 68, 0.8)' },
};

export function sensorState(sensor: ReactiveSensor | undefined): boolean {
  if (!sensor) return false;

  if (isReactiveContactSensor(sensor)) return sensor.getProperty(ContactProperty.Detected) ?? false;
  if (isReactiveLightControl(sensor)) return sensor.getProperty(LightProperty.On) ?? false;
  if (sensor.type === SensorType.Switch) return sensor.getProperty(SwitchProperty.On) ?? false;
  if (isReactiveSirenControl(sensor)) return sensor.getProperty(SirenProperty.Active) ?? false;
  if (isReactiveLockControl(sensor)) return (sensor.getProperty(LockProperty.TargetState) ?? 0) === 0;
  if (isReactiveOccupancySensor(sensor)) return sensor.getProperty(OccupancyProperty.Detected) ?? false;
  if (isReactiveSmokeSensor(sensor)) return sensor.getProperty(SmokeProperty.Detected) ?? false;
  if (isReactiveLeakSensor(sensor)) return sensor.getProperty(LeakProperty.Detected) ?? false;
  if (isReactiveGarageControl(sensor)) return (sensor.getProperty(GarageProperty.TargetState) ?? 1) === 0;
  if (isReactiveDoorbellTrigger(sensor)) return sensor.getProperty(DoorbellProperty.Ring) ?? false;
  if (isReactiveSecuritySystem(sensor)) {
    return (sensor.getProperty(SecuritySystemProperty.TargetState) ?? SecuritySystemState.Disarmed) !== SecuritySystemState.Disarmed;
  }
  if (isReactiveBatteryInfo(sensor)) return sensor.getProperty(BatteryProperty.Low) ?? false;

  return false;
}

export function sensorIcon(type: string, sensor: ReactiveSensor | undefined): Component | undefined {
  const active = sensorState(sensor);

  switch (type) {
    case 'contact':
      return active ? DoorOpen : DoorClosed;
    case 'light':
      return active ? LightbulbOn : LightbulbOff;
    case 'switch':
      return Power;
    case 'siren':
      return Siren;
    case 'lock':
      return active ? Locked : Unlocked;
    case 'temperature':
      return Thermometer;
    case 'humidity':
      return Droplets;
    case 'occupancy':
      return active ? MotionOn : MotionOff;
    case 'smoke':
      return active ? SmokeOn : SmokeOff;
    case 'leak':
      return active ? WaterAlert : WaterOff;
    case 'garage':
      return active ? GarageOpen : GarageShut;
    case 'doorbell':
      return Doorbell;
    case 'securitySystem':
      return securityIcon(sensor);
    case 'battery':
      return batteryIcon(sensor);
    default:
      return undefined;
  }
}

export function sensorTone(type: string, active: boolean): Record<string, string> {
  const tone = ACTIVE_TONES[type];
  if (!active || !tone) return { color: 'var(--text-secondary-color)' };
  return { color: tone.color, filter: `drop-shadow(0 0 8px ${tone.glow})` };
}

export function sensorReading(sensor: ReactiveSensor | undefined): string | undefined {
  if (!sensor) return undefined;

  if (isReactiveTemperatureInfo(sensor)) {
    const value = sensor.getProperty(TemperatureProperty.Current);
    return typeof value === 'number' ? `${value.toFixed(1)} °C` : undefined;
  }
  if (isReactiveHumidityInfo(sensor)) {
    const value = sensor.getProperty(HumidityProperty.Current);
    return typeof value === 'number' ? `${Math.round(value)} %` : undefined;
  }
  if (isReactiveBatteryInfo(sensor)) {
    const value = sensor.getProperty(BatteryProperty.Level);
    return typeof value === 'number' ? `${Math.round(value)} %` : undefined;
  }

  return undefined;
}

export async function toggleSensor(sensor: ReactiveSensor | undefined): Promise<void> {
  if (!sensor) return;

  const active = sensorState(sensor);

  if (isReactiveLightControl(sensor)) return void (await sensor.setProperty(LightProperty.On, !active));
  if (sensor.type === SensorType.Switch) return void (await sensor.setProperty(SwitchProperty.On, !active));
  if (isReactiveSirenControl(sensor)) return void (await sensor.setProperty(SirenProperty.Active, !active));
  if (isReactiveLockControl(sensor)) return void (await sensor.setProperty(LockProperty.TargetState, active ? 1 : 0));
  if (isReactiveGarageControl(sensor)) return void (await sensor.setProperty(GarageProperty.TargetState, active ? 1 : 0));
  if (isReactiveDoorbellTrigger(sensor)) return void (await sensor.setProperty(DoorbellProperty.Ring, true));
}

export async function setSecurityState(sensor: ReactiveSensor | undefined, state: SecuritySystemState): Promise<void> {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return;
  await sensor.setProperty(SecuritySystemProperty.TargetState, state);
}

export function securityState(sensor: ReactiveSensor | undefined): SecuritySystemState {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return SecuritySystemState.Disarmed;
  return sensor.getProperty(SecuritySystemProperty.CurrentState) ?? sensor.getProperty(SecuritySystemProperty.TargetState) ?? SecuritySystemState.Disarmed;
}

export function sensorStateText(type: string, sensor: ReactiveSensor | undefined): string {
  const reading = sensorReading(sensor);
  if (reading) return reading;

  const active = sensorState(sensor);

  switch (type) {
    case 'contact':
      return active ? 'open' : 'closed';
    case 'lock':
      return active ? 'locked' : 'unlocked';
    case 'garage':
      return active ? 'open' : 'closed';
    case 'light':
    case 'switch':
    case 'siren':
      return active ? 'on' : 'off';
    case 'occupancy':
      return active ? 'occupied' : 'clear';
    case 'smoke':
    case 'leak':
      return active ? 'alarm' : 'clear';
    case 'securitySystem':
      return active ? 'armed' : 'disarmed';
    default:
      return active ? 'active' : 'idle';
  }
}

function securityIcon(sensor: ReactiveSensor | undefined): Component {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return ShieldOff;

  const state = sensor.getProperty(SecuritySystemProperty.CurrentState) ?? sensor.getProperty(SecuritySystemProperty.TargetState) ?? SecuritySystemState.Disarmed;

  switch (state) {
    case SecuritySystemState.AlarmTriggered:
      return ShieldAlert;
    case SecuritySystemState.StayArm:
      return ShieldHome;
    case SecuritySystemState.AwayArm:
      return ShieldLock;
    case SecuritySystemState.NightArm:
      return ShieldMoon;
    default:
      return ShieldOff;
  }
}

function batteryIcon(sensor: ReactiveSensor | undefined): Component {
  if (!sensor || !isReactiveBatteryInfo(sensor)) return BatteryOutline;

  const reading = sensor.getProperty(BatteryProperty.Level);
  const level = typeof reading === 'number' ? reading : 0;
  const charging = sensor.getProperty(BatteryProperty.Charging) === ChargingState.Charging;

  if (level >= 90) return charging ? BatteryCharging100 : Battery100;
  if (level >= 70) return charging ? BatteryCharging80 : Battery80;
  if (level >= 50) return charging ? BatteryCharging60 : Battery60;
  if (level >= 30) return charging ? BatteryCharging40 : Battery40;
  if (level >= 15) return charging ? BatteryCharging20 : Battery20;

  return BatteryOutline;
}
