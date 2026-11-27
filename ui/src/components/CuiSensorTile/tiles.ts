import { SensorType } from '@camera.ui/sdk';

import CuiSecurityTileCard from './alarm/CuiSecurityTileCard.vue';
import CuiSecurityTileLarge from './alarm/CuiSecurityTileLarge.vue';
import CuiSecurityTileWidget from './alarm/CuiSecurityTileWidget.vue';
import CuiSirenTileCard from './alarm/CuiSirenTileCard.vue';
import CuiSirenTileLarge from './alarm/CuiSirenTileLarge.vue';
import CuiSirenTileWidget from './alarm/CuiSirenTileWidget.vue';
import CuiBinaryTileCard from './binary/CuiBinaryTileCard.vue';
import CuiBinaryTileLarge from './binary/CuiBinaryTileLarge.vue';
import CuiBinaryTileWidget from './binary/CuiBinaryTileWidget.vue';
import { BINARY_GROUPS } from './binary/groups.js';
import CuiDetectionTileCard from './detection/CuiDetectionTileCard.vue';
import CuiDetectionTileLarge from './detection/CuiDetectionTileLarge.vue';
import CuiDetectionTileWidget from './detection/CuiDetectionTileWidget.vue';
import CuiHelperTileLarge from './detection/CuiHelperTileLarge.vue';
import CuiHelperTileWidget from './detection/CuiHelperTileWidget.vue';
import { DETECTION_TYPES, HELPER_TYPES } from './detection/groups.js';
import CuiDisplayTileCard from './display/CuiDisplayTileCard.vue';
import CuiDisplayTileLarge from './display/CuiDisplayTileLarge.vue';
import CuiDisplayTileWidget from './display/CuiDisplayTileWidget.vue';
import CuiEventTileCard from './event/CuiEventTileCard.vue';
import CuiEventTileLarge from './event/CuiEventTileLarge.vue';
import CuiEventTileWidget from './event/CuiEventTileWidget.vue';
import { EVENT_TYPES } from './event/groups.js';
import CuiChimeTileCard from './chime/CuiChimeTileCard.vue';
import CuiChimeTileLarge from './chime/CuiChimeTileLarge.vue';
import CuiChimeTileWidget from './chime/CuiChimeTileWidget.vue';
import CuiClimateTileCard from './climate/CuiClimateTileCard.vue';
import CuiClimateTileLarge from './climate/CuiClimateTileLarge.vue';
import CuiClimateTileWidget from './climate/CuiClimateTileWidget.vue';
import CuiHumidifierTileCard from './climate/CuiHumidifierTileCard.vue';
import CuiHumidifierTileLarge from './climate/CuiHumidifierTileLarge.vue';
import CuiHumidifierTileWidget from './climate/CuiHumidifierTileWidget.vue';
import CuiCoverTileCard from './cover/CuiCoverTileCard.vue';
import CuiCoverTileLarge from './cover/CuiCoverTileLarge.vue';
import CuiCoverTileWidget from './cover/CuiCoverTileWidget.vue';
import CuiGarageTileCard from './cover/CuiGarageTileCard.vue';
import CuiGarageTileLarge from './cover/CuiGarageTileLarge.vue';
import CuiGarageTileWidget from './cover/CuiGarageTileWidget.vue';
import CuiFanTileCard from './fan/CuiFanTileCard.vue';
import CuiFanTileLarge from './fan/CuiFanTileLarge.vue';
import CuiFanTileWidget from './fan/CuiFanTileWidget.vue';
import CuiLightTileCard from './light/CuiLightTileCard.vue';
import CuiLightTileLarge from './light/CuiLightTileLarge.vue';
import CuiLightTileWidget from './light/CuiLightTileWidget.vue';
import CuiLockTileCard from './lock/CuiLockTileCard.vue';
import CuiLockTileLarge from './lock/CuiLockTileLarge.vue';
import CuiLockTileWidget from './lock/CuiLockTileWidget.vue';
import CuiMeasurementTileCard from './measurement/CuiMeasurementTileCard.vue';
import CuiMeasurementTileLarge from './measurement/CuiMeasurementTileLarge.vue';
import CuiMeasurementTileWidget from './measurement/CuiMeasurementTileWidget.vue';
import CuiMediaTileCard from './media/CuiMediaTileCard.vue';
import CuiMediaTileLarge from './media/CuiMediaTileLarge.vue';
import CuiMediaTileWidget from './media/CuiMediaTileWidget.vue';
import CuiPtzTileCard from './ptz/CuiPtzTileCard.vue';
import CuiPtzTileLarge from './ptz/CuiPtzTileLarge.vue';
import CuiPtzTileWidget from './ptz/CuiPtzTileWidget.vue';
import CuiRobotTileCard from './robot/CuiRobotTileCard.vue';
import CuiRobotTileLarge from './robot/CuiRobotTileLarge.vue';
import CuiRobotTileWidget from './robot/CuiRobotTileWidget.vue';
import CuiSwitchTileCard from './switch/CuiSwitchTileCard.vue';
import CuiSwitchTileLarge from './switch/CuiSwitchTileLarge.vue';
import CuiSwitchTileWidget from './switch/CuiSwitchTileWidget.vue';
import CuiValveTileCard from './valve/CuiValveTileCard.vue';
import CuiValveTileLarge from './valve/CuiValveTileLarge.vue';
import CuiValveTileWidget from './valve/CuiValveTileWidget.vue';

import type { Component } from 'vue';
import type { SensorTileSet } from './types.js';

const SWITCH_TILES = tileSet(CuiSwitchTileCard, CuiSwitchTileLarge, CuiSwitchTileWidget);
const CLIMATE_TILES = tileSet(CuiClimateTileCard, CuiClimateTileLarge, CuiClimateTileWidget);
const FAN_TILES = tileSet(CuiFanTileCard, CuiFanTileLarge, CuiFanTileWidget);
const BINARY_TILES = tileSet(CuiBinaryTileCard, CuiBinaryTileLarge, CuiBinaryTileWidget);
const DETECTION_TILES = tileSet(CuiDetectionTileCard, CuiDetectionTileLarge, CuiDetectionTileWidget);
const HELPER_TILES = tileSet(CuiDetectionTileCard, CuiHelperTileLarge, CuiHelperTileWidget);
const EVENT_TILES = tileSet(CuiEventTileCard, CuiEventTileLarge, CuiEventTileWidget);
const ROBOT_TILES = tileSet(CuiRobotTileCard, CuiRobotTileLarge, CuiRobotTileWidget);
const MEASUREMENT_TILES = tileSet(CuiMeasurementTileCard, CuiMeasurementTileLarge, CuiMeasurementTileWidget);

export const MEASUREMENT_TYPES: readonly string[] = [
  SensorType.Temperature,
  SensorType.Humidity,
  SensorType.Illuminance,
  SensorType.CarbonDioxide,
  SensorType.AirQuality,
  SensorType.Battery,
];

export const SENSOR_TILES: Partial<Record<string, SensorTileSet>> = {
  ...Object.fromEntries(Object.keys(BINARY_GROUPS).map((type) => [type, BINARY_TILES])),
  ...Object.fromEntries(DETECTION_TYPES.map((type) => [type, DETECTION_TILES])),
  ...Object.fromEntries(HELPER_TYPES.map((type) => [type, HELPER_TILES])),
  ...Object.fromEntries(EVENT_TYPES.map((type) => [type, EVENT_TILES])),
  ...Object.fromEntries(MEASUREMENT_TYPES.map((type) => [type, MEASUREMENT_TILES])),
  [SensorType.Light]: tileSet(CuiLightTileCard, CuiLightTileLarge, CuiLightTileWidget),
  [SensorType.Cover]: tileSet(CuiCoverTileCard, CuiCoverTileLarge, CuiCoverTileWidget),
  [SensorType.Garage]: tileSet(CuiGarageTileCard, CuiGarageTileLarge, CuiGarageTileWidget),
  [SensorType.Lock]: tileSet(CuiLockTileCard, CuiLockTileLarge, CuiLockTileWidget),
  [SensorType.Switch]: SWITCH_TILES,
  [SensorType.Outlet]: SWITCH_TILES,
  [SensorType.Thermostat]: CLIMATE_TILES,
  [SensorType.WaterHeater]: CLIMATE_TILES,
  [SensorType.Fan]: FAN_TILES,
  [SensorType.AirPurifier]: FAN_TILES,
  [SensorType.MediaPlayer]: tileSet(CuiMediaTileCard, CuiMediaTileLarge, CuiMediaTileWidget),
  [SensorType.SecuritySystem]: tileSet(CuiSecurityTileCard, CuiSecurityTileLarge, CuiSecurityTileWidget),
  [SensorType.Siren]: tileSet(CuiSirenTileCard, CuiSirenTileLarge, CuiSirenTileWidget),
  [SensorType.Humidifier]: tileSet(CuiHumidifierTileCard, CuiHumidifierTileLarge, CuiHumidifierTileWidget),
  [SensorType.Valve]: tileSet(CuiValveTileCard, CuiValveTileLarge, CuiValveTileWidget),
  [SensorType.Chime]: tileSet(CuiChimeTileCard, CuiChimeTileLarge, CuiChimeTileWidget),
  [SensorType.Display]: tileSet(CuiDisplayTileCard, CuiDisplayTileLarge, CuiDisplayTileWidget),
  [SensorType.PTZ]: tileSet(CuiPtzTileCard, CuiPtzTileLarge, CuiPtzTileWidget),
  [SensorType.Vacuum]: ROBOT_TILES,
  [SensorType.LawnMower]: ROBOT_TILES,
};

export function hasSensorTile(type: string): boolean {
  return type in SENSOR_TILES;
}

function tileSet(card: Component, large: Component, widget: Component): SensorTileSet {
  return { mini: card, small: card, medium: card, large, widget };
}
