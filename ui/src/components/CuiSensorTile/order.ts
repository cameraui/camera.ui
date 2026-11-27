import { SensorDomain, sensorMeta, SensorType } from '@camera.ui/sdk';

import { EVENT_TYPES } from './event/groups.js';

const DOMAIN_ORDER: string[] = [
  SensorDomain.Light,
  SensorDomain.Switch,
  SensorDomain.Lock,
  SensorDomain.Siren,
  SensorDomain.Alarm,
  SensorDomain.Cover,
  SensorDomain.Climate,
  SensorDomain.WaterHeater,
  SensorDomain.Fan,
  SensorDomain.AirPurifier,
  SensorDomain.Humidifier,
  SensorDomain.Valve,
  SensorDomain.MediaPlayer,
  SensorDomain.Vacuum,
  SensorDomain.LawnMower,
  SensorDomain.Event,
  SensorDomain.Scene,
  SensorDomain.Text,
  SensorDomain.Binary,
  SensorDomain.Measurement,
];

const TYPE_ORDER: string[] = Object.values(SensorType);

export function compareSensorTypes(a: string, b: string): number {
  return domainRank(a) - domainRank(b) || TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b);
}

function domainRank(type: string): number {
  const domain = EVENT_TYPES.includes(type) ? SensorDomain.Event : sensorMeta(type)?.semantics?.domain;
  const rank = DOMAIN_ORDER.indexOf(domain ?? '');
  return rank === -1 ? DOMAIN_ORDER.length : rank;
}
