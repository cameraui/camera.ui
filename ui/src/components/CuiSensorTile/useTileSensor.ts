import type { SensorTileProps } from './types.js';

export function useTileSensor(props: SensorTileProps) {
  const name = computed(() => props.sensor.displayName.value);
  const online = computed(() => props.sensor.connected.value);
  const interactive = computed(() => !props.disabled && online.value);
  return { name, online, interactive };
}
