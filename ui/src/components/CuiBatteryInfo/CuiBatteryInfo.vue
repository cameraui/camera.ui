<template>
  <div
    class="cui-battery-info"
    :class="[
      `cui-battery-info--${size}`,
      {
        'cui-battery-info--disabled': disabled,
        'cui-battery-info--low': isLow,
        'cui-battery-info--charging': isCharging,
      },
    ]"
  >
    <div class="cui-battery-info__header">
      <div class="cui-battery-info__icon">
        <i-lucide:battery-charging v-if="isCharging" class="cui-battery-info__icon-svg" :style="chargingIconStyle" />
        <i-lucide:battery-full v-else-if="level >= 90" class="cui-battery-info__icon-svg" :style="fullIconStyle" />
        <i-lucide:battery-medium v-else-if="level >= 50" class="cui-battery-info__icon-svg" :style="mediumIconStyle" />
        <i-lucide:battery-low v-else-if="level >= 20" class="cui-battery-info__icon-svg" :style="lowIconStyle" />
        <i-lucide:battery-warning v-else class="cui-battery-info__icon-svg cui-battery-info__icon-svg--critical" :style="criticalIconStyle" />
      </div>

      <div class="cui-battery-info__info">
        <span v-if="label" class="cui-battery-info__label">{{ label }}</span>
        <span class="cui-battery-info__status" :class="statusClass">
          {{ statusText }}
        </span>
      </div>

      <div class="cui-battery-info__level" :class="levelClass">{{ level }}%</div>
    </div>

    <div class="cui-battery-info__bar">
      <div class="cui-battery-info__bar-fill" :style="barStyle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiBatteryInfoProps } from './types.js';

const props = withDefaults(defineProps<CuiBatteryInfoProps>(), {
  level: 100,
  charging: 'NOT_CHARGING',
  low: false,
  disabled: false,
  size: 'medium',
});

const { t } = useI18n();

const { level, label, disabled, size, charging, low } = toRefs(props);

const isCharging = computed(() => charging.value === 'CHARGING');
const isFull = computed(() => charging.value === 'FULL' || level.value === 100);
const isLow = computed(() => low.value || level.value <= 20);

const statusText = computed(() => {
  if (charging.value === 'CHARGING') return t('components.battery_info.charging');
  if (charging.value === 'FULL') return t('components.battery_info.fully_charged');
  if (charging.value === 'NOT_CHARGEABLE') return t('components.battery_info.not_chargeable');
  if (level.value <= 10) return t('components.battery_info.critically_low');
  if (level.value <= 20) return t('components.battery_info.low');
  return t('components.battery_info.ready');
});

const statusClass = computed(() => {
  if (isCharging.value) return 'cui-battery-info__status--charging';
  if (isFull.value) return 'cui-battery-info__status--full';
  if (level.value <= 10) return 'cui-battery-info__status--critical';
  if (isLow.value) return 'cui-battery-info__status--low';
  return '';
});

const levelClass = computed(() => {
  if (isCharging.value) return 'cui-battery-info__level--charging';
  if (isFull.value) return 'cui-battery-info__level--full';
  if (level.value <= 10) return 'cui-battery-info__level--critical';
  if (isLow.value) return 'cui-battery-info__level--low';
  return '';
});

const chargingIconStyle = computed(() => ({
  color: 'rgb(59, 130, 246)',
  filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))',
}));

const fullIconStyle = computed(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.5))',
}));

const mediumIconStyle = computed(() => ({
  color: 'rgb(34, 197, 94)',
}));

const lowIconStyle = computed(() => ({
  color: 'rgb(234, 179, 8)',
}));

const criticalIconStyle = computed(() => ({
  color: 'rgb(239, 68, 68)',
  filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.5))',
}));

const barStyle = computed(() => {
  let color = 'rgb(34, 197, 94)';
  if (isCharging.value) color = 'rgb(59, 130, 246)';
  else if (level.value <= 10) color = 'rgb(239, 68, 68)';
  else if (level.value <= 20) color = 'rgb(234, 179, 8)';

  return {
    width: `${level.value}%`,
    backgroundColor: color,
  };
});
</script>

<style scoped>
.cui-battery-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-battery-info--disabled {
  opacity: 0.6;
}

/* Header */
.cui-battery-info__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-battery-info__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-battery-info__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-battery-info__icon-svg--critical {
  animation: battery-pulse 1s ease-in-out infinite;
}

@keyframes battery-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.cui-battery-info__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-battery-info__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-battery-info__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-battery-info__status--charging {
  color: rgb(59, 130, 246);
}

.cui-battery-info__status--full {
  color: rgb(34, 197, 94);
}

.cui-battery-info__status--low {
  color: rgb(234, 179, 8);
}

.cui-battery-info__status--critical {
  color: rgb(239, 68, 68);
  animation: status-blink 0.5s ease-in-out infinite alternate;
}

@keyframes status-blink {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.6;
  }
}

.cui-battery-info__level {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-battery-info__level--charging {
  color: rgb(59, 130, 246);
}

.cui-battery-info__level--full {
  color: rgb(34, 197, 94);
}

.cui-battery-info__level--low {
  color: rgb(234, 179, 8);
}

.cui-battery-info__level--critical {
  color: rgb(239, 68, 68);
}

/* Battery bar */
.cui-battery-info__bar {
  height: 0.25rem;
  border-radius: 0.125rem;
  overflow: hidden;
}

.cui-battery-info__bar-fill {
  height: 100%;
  border-radius: 0.125rem;
  transition:
    width 0.3s ease,
    background-color 0.3s ease;
}

/* Size variants */
.cui-battery-info--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-battery-info--small .cui-battery-info__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-battery-info--small .cui-battery-info__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-battery-info--small .cui-battery-info__label {
  font-size: 0.75rem;
}

.cui-battery-info--small .cui-battery-info__status {
  font-size: 0.625rem;
}

.cui-battery-info--small .cui-battery-info__level {
  font-size: 0.75rem;
}

.cui-battery-info--small .cui-battery-info__bar {
  height: 0.1875rem;
}

.cui-battery-info--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-battery-info--large .cui-battery-info__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-battery-info--large .cui-battery-info__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-battery-info--large .cui-battery-info__label {
  font-size: 1rem;
}

.cui-battery-info--large .cui-battery-info__status {
  font-size: 0.875rem;
}

.cui-battery-info--large .cui-battery-info__level {
  font-size: 1rem;
}

.cui-battery-info--large .cui-battery-info__bar {
  height: 0.375rem;
}
</style>
