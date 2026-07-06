<template>
  <div
    class="cui-temperature-info"
    :class="[
      `cui-temperature-info--${size}`,
      {
        'cui-temperature-info--disabled': disabled,
      },
    ]"
  >
    <div class="cui-temperature-info__header">
      <div class="cui-temperature-info__icon">
        <i-lucide:thermometer class="cui-temperature-info__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-temperature-info__info">
        <span v-if="label" class="cui-temperature-info__label">{{ label }}</span>
        <span class="cui-temperature-info__status" :style="{ color: valueColor }">
          {{ current != null ? `${current}°C` : '--' }}
        </span>
      </div>

      <div class="cui-temperature-info__value" :style="valueStyle">
        {{ current != null ? `${current}°C` : '--' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiTemperatureInfoProps } from './types.js';

const props = withDefaults(defineProps<CuiTemperatureInfoProps>(), {
  disabled: false,
  size: 'medium',
});

const { label, current, disabled, size } = toRefs(props);

const valueColor = computed(() => {
  if (current.value == null) return 'rgb(156, 163, 175)';
  if (current.value < 5) return 'rgb(59, 130, 246)';
  if (current.value < 15) return 'rgb(6, 182, 212)';
  if (current.value < 25) return 'rgb(34, 197, 94)';
  if (current.value < 35) return 'rgb(251, 146, 60)';
  return 'rgb(239, 68, 68)';
});
const iconStyle = computed(() => ({
  color: valueColor.value,
  filter: `drop-shadow(0 0 6px ${valueColor.value.replace('rgb', 'rgba').replace(')', ', 0.5)')})`,
}));
const valueStyle = computed(() => ({
  color: valueColor.value,
}));
</script>

<style scoped>
.cui-temperature-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-temperature-info--disabled {
  opacity: 0.6;
}

/* Header */
.cui-temperature-info__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-temperature-info__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-temperature-info__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-temperature-info__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-temperature-info__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-temperature-info__status {
  font-size: 0.75rem;
  font-weight: 500;
  transition: color 0.2s ease;
}

/* Value display (replaces indicator dot) */
.cui-temperature-info__value {
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
  transition: color 0.2s ease;
}

/* Size variants */
.cui-temperature-info--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-temperature-info--small .cui-temperature-info__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-temperature-info--small .cui-temperature-info__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-temperature-info--small .cui-temperature-info__label {
  font-size: 0.75rem;
}

.cui-temperature-info--small .cui-temperature-info__status {
  font-size: 0.625rem;
}

.cui-temperature-info--small .cui-temperature-info__value {
  font-size: 0.75rem;
}

.cui-temperature-info--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-temperature-info--large .cui-temperature-info__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-temperature-info--large .cui-temperature-info__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-temperature-info--large .cui-temperature-info__label {
  font-size: 1rem;
}

.cui-temperature-info--large .cui-temperature-info__status {
  font-size: 0.875rem;
}

.cui-temperature-info--large .cui-temperature-info__value {
  font-size: 1rem;
}
</style>
