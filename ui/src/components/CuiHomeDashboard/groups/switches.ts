import { OutletCapability, OutletProperty, sensorMeta, SwitchProperty } from '@camera.ui/sdk';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

export interface CuiHomeToggleChipProps {
  sensor: ReactiveSensor;
  label: string;
  on: boolean;
  disabled: boolean;
  color?: string;
  tail?: Component;
  tailLabel?: string;
}

export interface CuiHomeToggleChipEmits {
  (e: 'toggle'): void;
}

export interface CuiHomeSwitchChipProps {
  sensor: ReactiveSensor;
  color?: string;
  typed?: boolean;
  disabled: boolean;
}

export function powerProperty(sensor: ReactiveSensor): string {
  return sensorMeta(sensor.type)?.semantics?.commandProperty ?? SwitchProperty.On;
}

export function switchedOn(sensor: ReactiveSensor): boolean {
  return sensor.getProperty(powerProperty(sensor)) === true;
}

export function drawsPower(sensor: ReactiveSensor): boolean {
  return sensor.hasCapability(OutletCapability.InUse) && sensor.getProperty(OutletProperty.InUse) === true;
}
