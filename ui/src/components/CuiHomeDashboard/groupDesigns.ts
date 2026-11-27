import { SensorType } from '@camera.ui/sdk';

import { BINARY_GROUPS } from '@/components/CuiSensorTile/binary/groups.js';
import { MEASUREMENT_TYPES } from '@/components/CuiSensorTile/tiles.js';

import CuiHomeLights from './CuiHomeLights.vue';
import CuiHomeAlarm from './groups/CuiHomeAlarm.vue';
import CuiHomeClimate from './groups/CuiHomeClimate.vue';
import CuiHomeCovers from './groups/CuiHomeCovers.vue';
import CuiHomeLocks from './groups/CuiHomeLocks.vue';
import CuiHomeMedia from './groups/CuiHomeMedia.vue';
import CuiHomeOpenings from './groups/CuiHomeOpenings.vue';
import CuiHomePresence from './groups/CuiHomePresence.vue';
import CuiHomeReadings from './groups/CuiHomeReadings.vue';
import CuiHomeRobots from './groups/CuiHomeRobots.vue';
import CuiHomeSafety from './groups/CuiHomeSafety.vue';
import CuiHomeStates from './groups/CuiHomeStates.vue';
import CuiHomeSwitches from './groups/CuiHomeSwitches.vue';
import CuiHomeValves from './groups/CuiHomeValves.vue';

import type { HomeGroupDesign } from './types.js';

// families come from the tile sets, a new type in a family joins its design on its own
const READING_TYPES = MEASUREMENT_TYPES.filter((type) => type !== SensorType.Battery);
const SAFETY_TYPES = Object.keys(BINARY_GROUPS).filter((type) => BINARY_GROUPS[type] === 'alarm' || BINARY_GROUPS[type] === 'leak');
const ON_OFF_TYPES: string[] = [SensorType.Switch, SensorType.Outlet, SensorType.Fan, SensorType.AirPurifier, SensorType.Humidifier];

// on a tie the earlier entry wins
export const GROUP_DESIGNS: HomeGroupDesign[] = [
  { key: 'lights', component: CuiHomeLights, core: [SensorType.Light], extras: ON_OFF_TYPES },
  { key: 'covers', component: CuiHomeCovers, core: [SensorType.Cover] },
  { key: 'climate', component: CuiHomeClimate, core: [SensorType.Thermostat], extras: [SensorType.Temperature, SensorType.Humidity, SensorType.WaterHeater] },
  { key: 'readings', component: CuiHomeReadings, core: READING_TYPES, extras: [SensorType.Motion, SensorType.Occupancy] },
  { key: 'locks', component: CuiHomeLocks, core: [SensorType.Lock], extras: [SensorType.Contact] },
  { key: 'openings', component: CuiHomeOpenings, core: [SensorType.Contact], extras: [SensorType.Garage, SensorType.Lock] },
  { key: 'switches', component: CuiHomeSwitches, core: ON_OFF_TYPES, extras: [SensorType.Light] },
  { key: 'media', component: CuiHomeMedia, core: [SensorType.MediaPlayer] },
  { key: 'safety', component: CuiHomeSafety, core: SAFETY_TYPES, extras: [SensorType.Siren] },
  { key: 'alarm', component: CuiHomeAlarm, core: [SensorType.SecuritySystem, SensorType.Siren], extras: [SensorType.Contact, ...SAFETY_TYPES] },
  { key: 'robots', component: CuiHomeRobots, core: [SensorType.Vacuum, SensorType.LawnMower] },
  { key: 'valves', component: CuiHomeValves, core: [SensorType.Valve] },
  { key: 'presence', component: CuiHomePresence, core: [SensorType.Presence] },
  { key: 'states', component: CuiHomeStates, core: [SensorType.Motion, SensorType.Occupancy, SensorType.Vibration, SensorType.Power] },
];

export function groupDesign(types: string[]): HomeGroupDesign | undefined {
  // a battery comes with many devices and never decides the design
  const counted = types.filter((type) => type !== SensorType.Battery);
  if (!counted.length) return undefined;

  let best: HomeGroupDesign | undefined;
  let most = 0;
  for (const design of GROUP_DESIGNS) {
    if (!counted.every((type) => design.core.includes(type) || design.extras?.includes(type))) continue;
    const core = counted.filter((type) => design.core.includes(type)).length;
    if (core > most) [best, most] = [design, core];
  }
  return best;
}
