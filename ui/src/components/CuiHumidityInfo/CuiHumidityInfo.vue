<template>
  <div
    class="cui-humidity-info"
    :class="[
      `cui-humidity-info--${size}`,
      {
        'cui-humidity-info--disabled': disabled,
      },
    ]"
  >
    <div class="cui-humidity-info__header">
      <div class="cui-humidity-info__icon">
        <i-lucide:droplets class="cui-humidity-info__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-humidity-info__info">
        <span v-if="label" class="cui-humidity-info__label">{{ label }}</span>
        <span class="cui-humidity-info__status" :style="{ color: valueColor }">
          {{ current != null ? `${current}%` : '--' }}
        </span>
      </div>

      <div class="cui-humidity-info__value" :style="valueStyle">
        {{ current != null ? `${current}%` : '--' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiHumidityInfoProps } from './types.js';

const props = withDefaults(defineProps<CuiHumidityInfoProps>(), {
  disabled: false,
  size: 'medium',
});

const { label, current, disabled, size } = toRefs(props);

const valueColor = computed(() => {
  if (current.value == null) return 'rgb(156, 163, 175)';
  if (current.value < 30) return 'rgb(251, 146, 60)';
  if (current.value <= 60) return 'rgb(34, 197, 94)';
  return 'rgb(59, 130, 246)';
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
.cui-humidity-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-humidity-info--disabled {
  opacity: 0.6;
}

/* Header */
.cui-humidity-info__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-humidity-info__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-humidity-info__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-humidity-info__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-humidity-info__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-humidity-info__status {
  font-size: 0.75rem;
  font-weight: 500;
  transition: color 0.2s ease;
}

.cui-humidity-info__value {
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
  transition: color 0.2s ease;
}

.cui-humidity-info--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-humidity-info--small .cui-humidity-info__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-humidity-info--small .cui-humidity-info__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-humidity-info--small .cui-humidity-info__label {
  font-size: 0.75rem;
}

.cui-humidity-info--small .cui-humidity-info__status {
  font-size: 0.625rem;
}

.cui-humidity-info--small .cui-humidity-info__value {
  font-size: 0.75rem;
}

.cui-humidity-info--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-humidity-info--large .cui-humidity-info__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-humidity-info--large .cui-humidity-info__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-humidity-info--large .cui-humidity-info__label {
  font-size: 1rem;
}

.cui-humidity-info--large .cui-humidity-info__status {
  font-size: 0.875rem;
}

.cui-humidity-info--large .cui-humidity-info__value {
  font-size: 1rem;
}
</style>
