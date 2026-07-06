<template>
  <div class="cui-switch-control" :class="[`cui-switch-control--${size}`, { 'cui-switch-control--disabled': disabled }]">
    <div class="cui-switch-control__header">
      <div class="cui-switch-control__icon">
        <i-lucide:power v-if="isOn" class="cui-switch-control__icon-svg cui-switch-control__icon-svg--on" :style="iconGlowStyle" />
        <i-lucide:power-off v-else class="cui-switch-control__icon-svg" />
      </div>

      <span v-if="label" class="cui-switch-control__label">{{ label }}</span>

      <ToggleSwitch v-model="isOn" :disabled="disabled" class="cui-switch-control__toggle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiSwitchControlEmits, CuiSwitchControlProps } from './types.js';

const props = withDefaults(defineProps<CuiSwitchControlProps>(), {
  on: false,
  disabled: false,
  size: 'medium',
});

const emit = defineEmits<CuiSwitchControlEmits>();

const { on, size } = toRefs(props);

const isOn = computed({
  get: () => on.value,
  set: (value: boolean) => emit('update:on', value),
});
const iconGlowStyle = computed(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.7))',
}));
</script>

<style scoped>
.cui-switch-control {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.75rem;
}

.cui-switch-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Header */
.cui-switch-control__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cui-switch-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
}

.cui-switch-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-switch-control__label {
  flex: 1;
  font-weight: 500;
  color: var(--text-color);
}

.cui-switch-control__toggle {
  margin-left: auto;
}

/* Size variants */
.cui-switch-control--small {
  padding: 0.75rem;
  gap: 0.5rem;
}

.cui-switch-control--small .cui-switch-control__icon {
  width: 1.5rem;
  height: 1.5rem;
}

.cui-switch-control--small .cui-switch-control__icon-svg {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-switch-control--small .cui-switch-control__label {
  font-size: 0.875rem;
}

.cui-switch-control--large {
  padding: 1.25rem;
  gap: 1rem;
}

.cui-switch-control--large .cui-switch-control__icon {
  width: 2.5rem;
  height: 2.5rem;
}

.cui-switch-control--large .cui-switch-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-switch-control--large .cui-switch-control__label {
  font-size: 1.125rem;
}
</style>
