<template>
  <div class="cui-scene-control" :class="[`cui-scene-control--${size}`, { 'cui-scene-control--disabled': disabled }]">
    <div class="cui-scene-control__icon">
      <component :is="icon" class="cui-scene-control__icon-svg" :style="iconStyle" />
    </div>

    <div class="cui-scene-control__info">
      <span v-if="label" class="cui-scene-control__label">{{ label }}</span>
      <span class="cui-scene-control__status">{{ status }}</span>
    </div>

    <Button
      :label="t('components.scene_control.run')"
      :loading="active"
      :disabled
      size="small"
      severity="secondary"
      class="cui-scene-control__run"
      @click="emit('run')"
    />
  </div>
</template>

<script setup lang="ts">
import { formatRelativeTime } from '@/common/utils.js';
import { CUI_SCENE_CONTROL_DEFAULTS } from './types.js';

import type { CuiSceneControlEmits, CuiSceneControlProps } from './types.js';

const props = withDefaults(defineProps<CuiSceneControlProps>(), CUI_SCENE_CONTROL_DEFAULTS);
const emit = defineEmits<CuiSceneControlEmits>();

const { t } = useI18n();

const { active, lastRun } = toRefs(props);

const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60_000) });

const status = computed(() => {
  if (active.value) return t('components.sensor_state.running');
  if (!lastRun.value) return t('components.sensor_state.ready');
  return t('components.scene_control.ran', { time: formatRelativeTime(lastRun.value, now.value.getTime()) });
});
</script>

<style scoped>
.cui-scene-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-scene-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-scene-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-scene-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-scene-control__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cui-scene-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-scene-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-scene-control__run {
  margin-left: auto;
  flex-shrink: 0;
}

.cui-scene-control--small {
  padding: 0.5rem;
}

.cui-scene-control--small .cui-scene-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-scene-control--small .cui-scene-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-scene-control--small .cui-scene-control__label {
  font-size: 0.75rem;
}

.cui-scene-control--small .cui-scene-control__status {
  font-size: 0.625rem;
}

.cui-scene-control--large {
  padding: 1rem;
}

.cui-scene-control--large .cui-scene-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-scene-control--large .cui-scene-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-scene-control--large .cui-scene-control__label {
  font-size: 1rem;
}

.cui-scene-control--large .cui-scene-control__status {
  font-size: 0.875rem;
}
</style>
