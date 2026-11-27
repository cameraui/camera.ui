import { CoverCapability, CoverProperty, CoverState, SensorType } from '@camera.ui/sdk';

import { sensorOffers, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useGroupLevel, useGroupSend } from './groupControl.js';

import type { CoverDirection } from '@/components/CuiSensorTile/cover/useMovePress.js';
import type { ReactiveSensor } from '@camera.ui/browser';

export interface CuiHomeCoverWindowProps {
  sensor: ReactiveSensor;
  name: string;
  width: number;
  labeled?: boolean;
  disabled: boolean;
}

export interface CuiHomeCoverWindowEmits {
  (e: 'open', event: Event): void;
}

export function useCoverGroup(members: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();

  const online = computed(() => members().filter((cover) => cover.online.value));
  const positioned = computed(() => online.value.filter(hasPosition));
  const open = computed(() => members().filter((cover) => positionOf(cover) > 0));
  const canStop = computed(() => online.value.some(stops));
  const obstructed = computed(() => members().some((cover) => cover.getProperty(CoverProperty.ObstructionDetected) === true));
  const color = computed(() => (obstructed.value ? toneColor('alarm') : sensorToneColor(SensorType.Cover, true)));

  const { preview, input: inputLevel, commit: commitLevel } = useGroupLevel(() => positioned.value, moveTo);
  const held = shallowRef<number>();

  const level = computed(() => {
    if (held.value !== undefined) return held.value / 100;
    return preview.value ?? average(members().map(positionOf)) / 100;
  });
  const percent = computed(() => Math.round(level.value * 100));

  const stateText = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (obstructed.value) return t('components.sensor_tile.obstructed');
    if (members().some((cover) => stateOf(cover) === CoverState.Opening)) return t('components.sensor_state.opening');
    if (members().some((cover) => stateOf(cover) === CoverState.Closing)) return t('components.sensor_state.closing');
    const closed = members().length - open.value.length;
    if (!open.value.length) return t('views.home_dashboard.groups.covers.all_closed');
    if (!closed) return t('views.home_dashboard.groups.covers.all_open');
    return t('views.home_dashboard.groups.covers.some_open', { open: open.value.length, closed });
  });

  function moveAll(direction: CoverDirection) {
    const target = direction === 'up' ? CoverState.Open : CoverState.Closed;
    send(online.value, (cover) => cover.setProperty(CoverProperty.TargetState, target));
  }

  function stopAll() {
    const targets = online.value.filter((cover) => stops(cover) || (hasPosition(cover) && isMoving(cover)));
    send(targets, (cover) => (stops(cover) ? cover.setProperty(CoverProperty.Stop, true) : cover.setProperty(CoverProperty.TargetPosition, positionOf(cover))));
  }

  return { positioned, open, canStop, color, held, level, percent, stateText, moveAll, stopAll, inputLevel, commitLevel };
}

function moveTo(cover: ReactiveSensor, ratio: number): Promise<void> {
  return cover.setProperty(CoverProperty.TargetPosition, Math.round(ratio * 100));
}

function hasPosition(cover: ReactiveSensor): boolean {
  return cover.hasCapability(CoverCapability.Position);
}

function stops(cover: ReactiveSensor): boolean {
  return sensorOffers(cover, CoverProperty.Stop);
}

function stateOf(cover: ReactiveSensor): CoverState | undefined {
  return cover.getProperty<CoverState>(CoverProperty.CurrentState);
}

function isMoving(cover: ReactiveSensor): boolean {
  return stateOf(cover) === CoverState.Opening || stateOf(cover) === CoverState.Closing;
}

function positionOf(cover: ReactiveSensor): number {
  const wanted = cover.getProperty<CoverState>(CoverProperty.TargetState) ?? stateOf(cover);
  if (!hasPosition(cover)) return wanted === CoverState.Open || stateOf(cover) === CoverState.Stopped ? 100 : 0;
  return cover.getProperty<number>(CoverProperty.CurrentPosition) ?? cover.getProperty<number>(CoverProperty.TargetPosition) ?? (wanted === CoverState.Open ? 100 : 0);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
