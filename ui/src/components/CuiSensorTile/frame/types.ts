import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { TileOption } from '../types.js';
import type { SensorMoment } from '../useSensorMoments.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

export interface CuiTileButtonProps {
  icon: Component;
  label: string;
  color?: string;
  active?: boolean;
  interactive?: boolean;
  offline?: boolean;
  hero?: boolean;
}

export interface CuiTileIconProps {
  icon: Component;
  active?: boolean;
  badge?: Component;
  badgeLabel?: string;
}

export interface CuiTileCardProps {
  icon: Component;
  title: string;
  state?: string;
  value?: string;
  caption?: string;
  color?: string;
  active?: boolean;
  fill?: number;
  fillColor?: string;
  fillEnd?: number;
  fillEndColor?: string;
  badge?: Component;
  badgeLabel?: string;
  dragging?: boolean;
  offline?: boolean;
  compact?: boolean;
}

export interface TileScaleZone {
  to: number;
  color: string;
}

export interface CuiTileScaleProps {
  ratio?: number;
  color?: string;
  zones?: TileScaleZone[];
  gradient?: [from: string, to: string];
  thin?: boolean;
}

export interface CuiTileHistoryHeadProps {
  sensor: ReactiveSensor;
  label: string;
}

export interface CuiTileTimelineProps {
  sensor: ReactiveSensor;
  property: string;
  entries: SensorHistoryEntry[];
  now: number;
  colorOf?: (value: unknown) => string | undefined;
}

export type CuiTileHistoryTimelineProps = Pick<CuiTileTimelineProps, 'sensor' | 'property' | 'colorOf'>;

export interface CuiTileControlProps {
  caption: string;
}

export interface CuiTileMiniButtonProps {
  icon: Component;
  label: string;
}

export interface CuiHoldButtonProps {
  icon: Component;
  label: string;
  color?: string;
  active?: boolean;
  guarded: boolean;
  interactive: boolean;
}

export interface CuiHoldButtonEmits {
  (e: 'press'): void;
  (e: 'hint', shown: boolean): void;
}

export interface CuiTileReadingProps {
  state: string;
  detail?: string;
}

export interface CuiTilePanelProps {
  icon: Component;
  title: string;
  state?: string;
  color?: string;
  active?: boolean;
  offline?: boolean;
}

export interface CuiLevelBarProps {
  value: number;
  label: string;
  color?: string;
  disabled?: boolean;
}

export interface CuiLevelBarEmits {
  (e: 'input', value: number): void;
  (e: 'commit', value: number): void;
}

export interface CuiFlowLineProps {
  flowing?: boolean;
}

export interface CuiHoldRingProps {
  active?: boolean;
  holding?: boolean;
  progress?: number;
  spinning?: boolean;
}

export interface CuiHoldDialProps {
  label: string;
  checked: boolean;
  active?: boolean;
  holding?: boolean;
  progress?: number;
  spinning?: boolean;
  interactive?: boolean;
}

export interface CuiTileCornerButtonProps {
  label: string;
}

export interface TileMomentRow {
  label: string;
  detail?: string;
  color?: string;
}

export interface CuiTileMomentsProps {
  sensor: ReactiveSensor;
  moments: SensorMoment[];
  loaded: boolean;
  describe: (moment: SensorMoment) => TileMomentRow;
}

export interface CuiTileChipsProps {
  label: string;
  options: TileOption[];
  selected?: string;
  disabled?: boolean;
}

export interface CuiTileChipsEmits {
  (e: 'select', value: string): void;
}
