import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component, MaybeRefOrGetter } from 'vue';

export interface CuiHomeChipProps {
  sensor?: ReactiveSensor;
  label: string;
  detail?: string;
  icon: Component;
  on: boolean;
  color?: string;
  ariaLabel?: string;
  large?: boolean;
  offline?: boolean;
  pressable?: boolean;
  guarded?: boolean;
  interactive?: boolean;
}

export interface CuiHomeChipEmits {
  (e: 'press'): void;
  (e: 'hint', shown: boolean): void;
}

export interface CuiHomeStatusRowProps {
  sensor?: ReactiveSensor;
  icon: Component;
  name: string;
  state: string;
  on: boolean;
  color?: string;
  offline?: boolean;
}

export interface HomeMatrixItem {
  key: string;
  icon: Component;
  on: boolean;
  color?: string;
}

export interface CuiHomeIconMatrixProps {
  items: HomeMatrixItem[];
  rows: number;
  label: string;
}

const COMPACT_CHROME = 76;
export const MATRIX_GAP = 6;
export const MATRIX_PITCH = 30;
const MINUTE = 60_000;

export function useCompactSpace(target: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const { height } = useElementSize(target, undefined, { box: 'border-box' });
  return computed(() => height.value - COMPACT_CHROME);
}

export function matrixRows(height: number): number {
  return Math.max(1, Math.floor((height + MATRIX_GAP) / MATRIX_PITCH));
}

export function useDuration() {
  const { locale } = useI18n();
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 30_000) });

  function duration(since: number): string {
    const minutes = Math.max(1, Math.floor((now.value.getTime() - since) / MINUTE));
    if (minutes < 60) return inUnit(minutes, 'minute');
    if (minutes < 24 * 60) return inUnit(Math.floor(minutes / 60), 'hour');
    return inUnit(Math.floor(minutes / (24 * 60)), 'day');
  }

  function inUnit(value: number, unit: string): string {
    return new Intl.NumberFormat(locale.value, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
  }

  return { duration };
}
