import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component, InjectionKey, Ref } from 'vue';

export type SensorTileSize = 'mini' | 'small' | 'medium' | 'large' | 'widget';

export type SensorTileSet = Record<SensorTileSize, Component>;

export const TILE_EXPAND: InjectionKey<(event: Event) => void> = Symbol('tile-expand');

export const TILE_WAIT: InjectionKey<TileWait> = Symbol('tile-wait');

export interface TileWait {
  waiting: Readonly<Ref<boolean>>;
  failed: Readonly<Ref<boolean>>;
  note: Readonly<Ref<string | undefined>>;
  dragging: Ref<boolean>;
}

export interface CuiSensorTileProps {
  sensor: ReactiveSensor;
  size?: SensorTileSize;
  disabled?: boolean;
  expandInPlace?: boolean;
}

export interface CuiSensorTileSheetProps {
  sensor: ReactiveSensor;
  disabled?: boolean;
}

export interface SensorTileProps {
  sensor: ReactiveSensor;
  size: SensorTileSize;
  disabled?: boolean;
}

export interface SensorTileEmits {
  (e: 'expand', event: Event): void;
}

export interface TileOption {
  value: string;
  label: string;
}

export interface TileToggle {
  property: string;
  label: string;
  value: boolean;
}
