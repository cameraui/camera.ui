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
  OutletProperty,
  SceneProperty,
  SecuritySystemProperty,
  SecuritySystemState,
  SensorType,
  SirenProperty,
  SwitchProperty,
  VacuumCommand,
  VacuumProperty,
  ValveProperty,
  ValveState,
} from '@camera.ui/sdk';

import { isSensorActive, sensorPropertySpec } from '@/common/sensorDisplay.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const SECURITY_MODES = [SecuritySystemState.Disarmed, SecuritySystemState.StayArm, SecuritySystemState.AwayArm, SecuritySystemState.NightArm];
const ROBOT_STOPS = [VacuumCommand.Dock, VacuumCommand.Stop, VacuumCommand.Pause];

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
  if (isReactiveDoorbellTrigger(sensor)) return await sensor.setProperty(DoorbellProperty.Ring, true);
}

function robotCommand(sensor: ReactiveSensor, working: boolean): string | undefined {
  const offered: unknown[] = Object.values(sensorPropertySpec(sensor, VacuumProperty.Command)?.values ?? {});
  return (working ? ROBOT_STOPS : [VacuumCommand.Start]).find((command) => offered.includes(command));
}

export async function setSecurityState(sensor: ReactiveSensor | undefined, state: SecuritySystemState): Promise<void> {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return;
  await sensor.setProperty(SecuritySystemProperty.TargetState, state);
}

export function securityModes(sensor: ReactiveSensor<object> | undefined): SecuritySystemState[] {
  const offered = sensor?.propertySpecs.value[SecuritySystemProperty.TargetState]?.values;
  return offered ? SECURITY_MODES.filter((mode) => Object.values(offered).includes(mode)) : SECURITY_MODES;
}

export function securityState(sensor: ReactiveSensor | undefined): SecuritySystemState {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return SecuritySystemState.Disarmed;
  return sensor.getProperty(SecuritySystemProperty.CurrentState) ?? sensor.getProperty(SecuritySystemProperty.TargetState) ?? SecuritySystemState.Disarmed;
}
