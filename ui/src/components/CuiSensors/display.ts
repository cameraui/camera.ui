import {
  isReactiveChimeControl,
  isReactiveDoorbellTrigger,
  isReactiveGarageControl,
  isReactiveLightControl,
  isReactiveLockControl,
  isReactiveOutletControl,
  isReactiveSecuritySystem,
  isReactiveSirenControl,
} from '@camera.ui/browser';
import {
  ChimeProperty,
  DoorbellProperty,
  GarageProperty,
  LightProperty,
  LockProperty,
  OutletProperty,
  SecuritySystemProperty,
  SecuritySystemState,
  SensorType,
  SirenProperty,
  SwitchProperty,
} from '@camera.ui/sdk';

import { isSensorActive } from '@/common/sensorDisplay.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const SECURITY_MODES = [SecuritySystemState.Disarmed, SecuritySystemState.StayArm, SecuritySystemState.AwayArm, SecuritySystemState.NightArm];

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
  if (isReactiveDoorbellTrigger(sensor)) return await sensor.setProperty(DoorbellProperty.Ring, true);
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
