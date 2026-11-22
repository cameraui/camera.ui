import {
  isReactiveAirPurifierControl,
  isReactiveChimeControl,
  isReactiveCoverControl,
  isReactiveDoorbellTrigger,
  isReactiveFanControl,
  isReactiveGarageControl,
  isReactiveHumidifierControl,
  isReactiveLawnMowerControl,
  isReactiveLightControl,
  isReactiveLockControl,
  isReactiveMediaPlayerControl,
  isReactiveOutletControl,
  isReactiveSceneControl,
  isReactiveSecuritySystem,
  isReactiveSirenControl,
  isReactiveVacuumControl,
  isReactiveValveControl,
} from '@camera.ui/browser';
import {
  AirPurifierProperty,
  ChimeProperty,
  CoverProperty,
  CoverState,
  DoorbellProperty,
  FanProperty,
  GarageProperty,
  HumidifierProperty,
  LightProperty,
  LockProperty,
  MediaPlayerCommand,
  MediaPlayerProperty,
  MediaPlayerState,
  OutletProperty,
  SceneProperty,
  SecuritySystemProperty,
  SecuritySystemState,
  SensorCategory,
  sensorMeta,
  SensorType,
  SirenProperty,
  SwitchProperty,
  VacuumCommand,
  VacuumProperty,
  ValveProperty,
  ValveState,
} from '@camera.ui/sdk';
import { SENSOR_TYPE_CONFIG } from '@shared/types';

import { isSensorActive, sensorOffers, sensorPropertySpec } from '@/common/sensorDisplay.js';

import type { ReactiveMediaPlayerControl, ReactiveSensor } from '@camera.ui/browser';

const SECURITY_MODES = [SecuritySystemState.Disarmed, SecuritySystemState.StayArm, SecuritySystemState.AwayArm, SecuritySystemState.NightArm];
const ROBOT_STOPS = [VacuumCommand.Dock, VacuumCommand.Stop, VacuumCommand.Pause];

export function sensorHasPrimaryAction(type: string): boolean {
  const category = SENSOR_TYPE_CONFIG[type as SensorType]?.category;
  if (category === SensorCategory.Sensor || category === SensorCategory.Info) return false;
  // a thermostat needs a mode and a target, one click has nothing to switch
  if (type === SensorType.Thermostat) return false;
  return Object.values(sensorMeta(type)?.properties ?? {}).some((spec) => spec.writable);
}

export async function toggleSensor(sensor: ReactiveSensor | undefined): Promise<void> {
  if (!sensor) return;

  const active = isSensorActive(sensor);

  if (isReactiveLightControl(sensor)) return await sensor.setProperty(LightProperty.On, !active);
  if (sensor.type === SensorType.Switch) return await sensor.setProperty(SwitchProperty.On, !active);
  if (isReactiveOutletControl(sensor)) return await sensor.setProperty(OutletProperty.On, !active);
  if (isReactiveSirenControl(sensor)) return await sensor.setProperty(SirenProperty.Active, !active);
  if (isReactiveChimeControl(sensor)) return await sensor.setProperty(ChimeProperty.Active, !active);
  if (isReactiveLockControl(sensor)) return await sensor.setProperty(LockProperty.TargetState, active ? 1 : 0);
  if (isReactiveGarageControl(sensor)) return await sensor.setProperty(GarageProperty.TargetState, active ? 1 : 0);
  if (isReactiveCoverControl(sensor)) return await sensor.setProperty(CoverProperty.TargetState, active ? CoverState.Closed : CoverState.Open);
  if (isReactiveFanControl(sensor)) return await sensor.setProperty(FanProperty.On, !active);
  if (isReactiveValveControl(sensor)) return await sensor.setProperty(ValveProperty.TargetState, active ? ValveState.Closed : ValveState.Open);
  if (isReactiveSceneControl(sensor)) return await sensor.setProperty(SceneProperty.Active, true);
  if (isReactiveHumidifierControl(sensor)) return await sensor.setProperty(HumidifierProperty.On, !active);
  if (isReactiveAirPurifierControl(sensor)) return await sensor.setProperty(AirPurifierProperty.On, !active);
  if (isReactiveVacuumControl(sensor) || isReactiveLawnMowerControl(sensor)) {
    const command = robotCommand(sensor, active);
    if (command) await sensor.setProperty(VacuumProperty.Command, command);
    return;
  }
  if (isReactiveMediaPlayerControl(sensor)) return await toggleMediaPlayer(sensor);
  if (isReactiveDoorbellTrigger(sensor)) return await sensor.setProperty(DoorbellProperty.Ring, true);
}

function robotCommand(sensor: ReactiveSensor, working: boolean): string | undefined {
  const offered = offeredCommands(sensor, VacuumProperty.Command);
  return (working ? ROBOT_STOPS : [VacuumCommand.Start]).find((command) => offered.includes(command));
}

async function toggleMediaPlayer(sensor: ReactiveMediaPlayerControl): Promise<void> {
  const state = sensor.getProperty(MediaPlayerProperty.State);
  const power = sensorOffers(sensor, MediaPlayerProperty.On);
  if (state === MediaPlayerState.Off) {
    if (power) await sensor.setProperty(MediaPlayerProperty.On, true);
    return;
  }
  const command = state === MediaPlayerState.Playing ? MediaPlayerCommand.Pause : MediaPlayerCommand.Play;
  if (offeredCommands(sensor, MediaPlayerProperty.Command).includes(command)) return await sensor.setProperty(MediaPlayerProperty.Command, command);
  if (power) await sensor.setProperty(MediaPlayerProperty.On, false);
}

function offeredCommands(sensor: ReactiveSensor<object>, property: string): unknown[] {
  return Object.values(sensorPropertySpec(sensor, property)?.values ?? {});
}

export async function setSecurityState(sensor: ReactiveSensor | undefined, state: SecuritySystemState): Promise<void> {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return;
  await sensor.setProperty(SecuritySystemProperty.TargetState, state);
}

export function securityModes(sensor: ReactiveSensor<object> | undefined): SecuritySystemState[] {
  const offered = sensor?.propertySpecs.value[SecuritySystemProperty.TargetState]?.values;
  return offered ? SECURITY_MODES.filter((mode) => Object.values(offered).includes(mode)) : SECURITY_MODES;
}

export function securityModeLabelKey(mode: SecuritySystemState): string {
  const name = Object.entries(sensorMeta(SensorType.SecuritySystem)?.semantics?.states ?? {}).find(([, state]) => state === mode)?.[0];
  return `components.sensor_state.${name}`;
}

export function securityState(sensor: ReactiveSensor | undefined): SecuritySystemState {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return SecuritySystemState.Disarmed;
  return sensor.getProperty(SecuritySystemProperty.CurrentState) ?? sensor.getProperty(SecuritySystemProperty.TargetState) ?? SecuritySystemState.Disarmed;
}
