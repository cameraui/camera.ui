import { ThermostatMode, WaterHeaterMode } from '@camera.ui/sdk';
import FanIcon from '~icons/mdi/fan';
import FireIcon from '~icons/mdi/fire';
import FlashIcon from '~icons/mdi/flash';
import GasBurnerIcon from '~icons/mdi/gas-burner';
import HeatPumpIcon from '~icons/mdi/heat-pump';
import LeafIcon from '~icons/mdi/leaf';
import PowerIcon from '~icons/mdi/power';
import RocketLaunchIcon from '~icons/mdi/rocket-launch';
import SnowflakeIcon from '~icons/mdi/snowflake';
import SpeedometerIcon from '~icons/mdi/speedometer';
import SunSnowflakeIcon from '~icons/mdi/sun-snowflake-variant';
import ThermostatIcon from '~icons/mdi/thermostat';
import ThermostatAutoIcon from '~icons/mdi/thermostat-auto';
import WaterBoilerIcon from '~icons/mdi/water-boiler';
import WaterPercentIcon from '~icons/mdi/water-percent';

import { toneColor } from '@/common/sensorDisplay.js';

import type { Component } from 'vue';

export const OFF_MODE = 'off';

const COOL_MODES = new Set<string>([ThermostatMode.Cool, ThermostatMode.Dry]);
const MODE_ICONS: Record<string, Component> = {
  [ThermostatMode.Off]: PowerIcon,
  [ThermostatMode.Heat]: FireIcon,
  [ThermostatMode.Cool]: SnowflakeIcon,
  [ThermostatMode.HeatCool]: SunSnowflakeIcon,
  [ThermostatMode.Auto]: ThermostatAutoIcon,
  [ThermostatMode.Dry]: WaterPercentIcon,
  [ThermostatMode.FanOnly]: FanIcon,
  [WaterHeaterMode.Eco]: LeafIcon,
  [WaterHeaterMode.Electric]: FlashIcon,
  [WaterHeaterMode.Gas]: GasBurnerIcon,
  [WaterHeaterMode.HeatPump]: HeatPumpIcon,
  [WaterHeaterMode.HighDemand]: RocketLaunchIcon,
  [WaterHeaterMode.Performance]: SpeedometerIcon,
  [WaterHeaterMode.On]: WaterBoilerIcon,
};

export function modeIcon(mode: string | undefined): Component {
  return (mode && MODE_ICONS[mode]) || ThermostatIcon;
}

export function modeColor(mode: string | undefined): string | undefined {
  if (!mode || mode === OFF_MODE || mode === ThermostatMode.FanOnly) return undefined;
  return toneColor(COOL_MODES.has(mode) ? 'info' : 'warn');
}
