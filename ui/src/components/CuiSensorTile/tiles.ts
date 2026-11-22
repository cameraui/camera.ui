import { SensorType } from '@camera.ui/sdk';

import CuiSecurityTileCard from './alarm/CuiSecurityTileCard.vue';
import CuiSecurityTileLarge from './alarm/CuiSecurityTileLarge.vue';
import CuiSirenTileCard from './alarm/CuiSirenTileCard.vue';
import CuiSirenTileLarge from './alarm/CuiSirenTileLarge.vue';
import CuiBinaryTileCard from './binary/CuiBinaryTileCard.vue';
import CuiBinaryTileLarge from './binary/CuiBinaryTileLarge.vue';
import { BINARY_GROUPS } from './binary/groups.js';
import CuiDetectionTileCard from './detection/CuiDetectionTileCard.vue';
import CuiDetectionTileLarge from './detection/CuiDetectionTileLarge.vue';
import CuiHelperTileLarge from './detection/CuiHelperTileLarge.vue';
import { DETECTION_TYPES, HELPER_TYPES } from './detection/groups.js';
import CuiDisplayTileCard from './display/CuiDisplayTileCard.vue';
import CuiDisplayTileLarge from './display/CuiDisplayTileLarge.vue';
import CuiEventTileCard from './event/CuiEventTileCard.vue';
import CuiEventTileLarge from './event/CuiEventTileLarge.vue';
import { EVENT_TYPES } from './event/groups.js';
import CuiChimeTileCard from './chime/CuiChimeTileCard.vue';
import CuiChimeTileLarge from './chime/CuiChimeTileLarge.vue';
import CuiClimateTileCard from './climate/CuiClimateTileCard.vue';
import CuiClimateTileLarge from './climate/CuiClimateTileLarge.vue';
import CuiHumidifierTileCard from './climate/CuiHumidifierTileCard.vue';
import CuiHumidifierTileLarge from './climate/CuiHumidifierTileLarge.vue';
import CuiCoverTileCard from './cover/CuiCoverTileCard.vue';
import CuiCoverTileLarge from './cover/CuiCoverTileLarge.vue';
import CuiGarageTileCard from './cover/CuiGarageTileCard.vue';
import CuiGarageTileLarge from './cover/CuiGarageTileLarge.vue';
import CuiFanTileCard from './fan/CuiFanTileCard.vue';
import CuiFanTileLarge from './fan/CuiFanTileLarge.vue';
import CuiLightTileCard from './light/CuiLightTileCard.vue';
import CuiLightTileLarge from './light/CuiLightTileLarge.vue';
import CuiLockTileCard from './lock/CuiLockTileCard.vue';
import CuiLockTileLarge from './lock/CuiLockTileLarge.vue';
import CuiMeasurementTileCard from './measurement/CuiMeasurementTileCard.vue';
import CuiMeasurementTileLarge from './measurement/CuiMeasurementTileLarge.vue';
import CuiMediaTileCard from './media/CuiMediaTileCard.vue';
import CuiMediaTileLarge from './media/CuiMediaTileLarge.vue';
import CuiPtzTileCard from './ptz/CuiPtzTileCard.vue';
import CuiPtzTileLarge from './ptz/CuiPtzTileLarge.vue';
import CuiRobotTileCard from './robot/CuiRobotTileCard.vue';
import CuiRobotTileLarge from './robot/CuiRobotTileLarge.vue';
import CuiSwitchTileCard from './switch/CuiSwitchTileCard.vue';
import CuiSwitchTileLarge from './switch/CuiSwitchTileLarge.vue';
import CuiValveTileCard from './valve/CuiValveTileCard.vue';
import CuiValveTileLarge from './valve/CuiValveTileLarge.vue';

import type { Component } from 'vue';
import type { SensorTileSize } from './types.js';

const SWITCH_TILES = { small: CuiSwitchTileCard, medium: CuiSwitchTileCard, large: CuiSwitchTileLarge };
const CLIMATE_TILES = { small: CuiClimateTileCard, medium: CuiClimateTileCard, large: CuiClimateTileLarge };
const FAN_TILES = { small: CuiFanTileCard, medium: CuiFanTileCard, large: CuiFanTileLarge };
const BINARY_TILES = { small: CuiBinaryTileCard, medium: CuiBinaryTileCard, large: CuiBinaryTileLarge };
const DETECTION_TILES = { small: CuiDetectionTileCard, medium: CuiDetectionTileCard, large: CuiDetectionTileLarge };
const HELPER_TILES = { small: CuiDetectionTileCard, medium: CuiDetectionTileCard, large: CuiHelperTileLarge };
const EVENT_TILES = { small: CuiEventTileCard, medium: CuiEventTileCard, large: CuiEventTileLarge };
const ROBOT_TILES = { small: CuiRobotTileCard, medium: CuiRobotTileCard, large: CuiRobotTileLarge };
const MEASUREMENT_TILES = { small: CuiMeasurementTileCard, medium: CuiMeasurementTileCard, large: CuiMeasurementTileLarge };

export const SENSOR_TILES: Partial<Record<string, Record<SensorTileSize, Component>>> = {
  ...Object.fromEntries(Object.keys(BINARY_GROUPS).map((type) => [type, BINARY_TILES])),
  ...Object.fromEntries(DETECTION_TYPES.map((type) => [type, DETECTION_TILES])),
  ...Object.fromEntries(HELPER_TYPES.map((type) => [type, HELPER_TILES])),
  ...Object.fromEntries(EVENT_TYPES.map((type) => [type, EVENT_TILES])),
  [SensorType.Light]: { small: CuiLightTileCard, medium: CuiLightTileCard, large: CuiLightTileLarge },
  [SensorType.Cover]: { small: CuiCoverTileCard, medium: CuiCoverTileCard, large: CuiCoverTileLarge },
  [SensorType.Garage]: { small: CuiGarageTileCard, medium: CuiGarageTileCard, large: CuiGarageTileLarge },
  [SensorType.Lock]: { small: CuiLockTileCard, medium: CuiLockTileCard, large: CuiLockTileLarge },
  [SensorType.Switch]: SWITCH_TILES,
  [SensorType.Outlet]: SWITCH_TILES,
  [SensorType.Thermostat]: CLIMATE_TILES,
  [SensorType.WaterHeater]: CLIMATE_TILES,
  [SensorType.Fan]: FAN_TILES,
  [SensorType.AirPurifier]: FAN_TILES,
  [SensorType.MediaPlayer]: { small: CuiMediaTileCard, medium: CuiMediaTileCard, large: CuiMediaTileLarge },
  [SensorType.SecuritySystem]: { small: CuiSecurityTileCard, medium: CuiSecurityTileCard, large: CuiSecurityTileLarge },
  [SensorType.Siren]: { small: CuiSirenTileCard, medium: CuiSirenTileCard, large: CuiSirenTileLarge },
  [SensorType.Humidifier]: { small: CuiHumidifierTileCard, medium: CuiHumidifierTileCard, large: CuiHumidifierTileLarge },
  [SensorType.Valve]: { small: CuiValveTileCard, medium: CuiValveTileCard, large: CuiValveTileLarge },
  [SensorType.Chime]: { small: CuiChimeTileCard, medium: CuiChimeTileCard, large: CuiChimeTileLarge },
  [SensorType.Display]: { small: CuiDisplayTileCard, medium: CuiDisplayTileCard, large: CuiDisplayTileLarge },
  [SensorType.PTZ]: { small: CuiPtzTileCard, medium: CuiPtzTileCard, large: CuiPtzTileLarge },
  [SensorType.Vacuum]: ROBOT_TILES,
  [SensorType.LawnMower]: ROBOT_TILES,
  [SensorType.Temperature]: MEASUREMENT_TILES,
  [SensorType.Humidity]: MEASUREMENT_TILES,
  [SensorType.Illuminance]: MEASUREMENT_TILES,
  [SensorType.CarbonDioxide]: MEASUREMENT_TILES,
  [SensorType.AirQuality]: MEASUREMENT_TILES,
  [SensorType.Battery]: MEASUREMENT_TILES,
};
