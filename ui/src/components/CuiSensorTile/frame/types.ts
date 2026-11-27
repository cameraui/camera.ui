import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';
import type { TileOption } from '../types.js';
import type { SensorMoment } from '../useSensorMoments.js';

export interface CuiTileButtonProps {
  icon: Component;
  label: string;
  color?: string;
  active?: boolean;
  interactive?: boolean;
  hero?: boolean;
}

export interface CuiTileButtonEmits {
  (e: 'click'): void;
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
  mini?: boolean;
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
  bare?: boolean;
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

export type TileWidgetForm = 'compact' | 'short' | 'tall';

export interface CuiTileWidgetProps {
  icon: Component;
  title: string;
  state?: string;
  summary?: string;
  color?: string;
  active?: boolean;
  offline?: boolean;
  badge?: Component;
  badgeLabel?: string;
  hero?: string;
  heroNote?: string;
  heroWord?: boolean;
  heroToned?: boolean;
  extraShowsHero?: boolean;
  opens?: boolean;
  note?: string;
}

export interface CuiTileWidgetEmits {
  (e: 'open', event: Event): void;
}

export interface CuiTileActionProps {
  icon?: Component;
  label: string;
  showLabel?: boolean;
  color?: string;
  active?: boolean;
  interactive?: boolean;
  progress?: number;
  waiting?: boolean;
  failed?: boolean;
}

export interface CuiTileActionEmits {
  (e: 'click', event: MouseEvent): void;
}

export interface CuiTileHoldActionProps extends Omit<CuiTileActionProps, 'progress'> {
  guarded: boolean;
  interactive: boolean;
}

export interface CuiTileHoldActionEmits {
  (e: 'press'): void;
  (e: 'hint', shown: boolean): void;
}

export interface CuiTileChoiceRowProps {
  options: TileOption[];
  selected?: string;
  interactive: boolean;
}

export interface CuiTileChoiceRowEmits {
  (e: 'select', value: string): void;
}

export interface CuiTileStepRowProps {
  downLabel: string;
  upLabel: string;
  interactive: boolean;
}

export interface CuiTileStepRowEmits {
  (e: 'step', direction: 1 | -1): void;
}

export interface CuiTilePanelProps {
  icon: Component;
  title: string;
  state?: string;
  color?: string;
  active?: boolean;
  offline?: boolean;
  fit?: boolean;
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
  limit?: number;
}

export interface CuiTileChipsEmits {
  (e: 'select', value: string): void;
}
