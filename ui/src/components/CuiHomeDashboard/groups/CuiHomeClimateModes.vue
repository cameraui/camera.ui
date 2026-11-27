<template>
  <div class="home-climate-modes" role="group" :aria-label="t('views.home_dashboard.groups.climate.modes')">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="home-climate-modes__option"
      :class="{ 'home-climate-modes__option--icon': icons, 'home-climate-modes__option--selected': option.value === selected }"
      :aria-pressed="option.value === selected"
      :aria-label="icons ? option.label : undefined"
      :disabled
      @click="emit('select', option.value)"
    >
      <component :is="option.icon" v-if="icons" class="home-climate-modes__icon" />
      <template v-else>{{ option.label }}</template>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CuiHomeClimateModesEmits, CuiHomeClimateModesProps } from './climate.js';

defineProps<CuiHomeClimateModesProps>();
const emit = defineEmits<CuiHomeClimateModesEmits>();

const { t } = useI18n();
</script>

<style scoped>
.home-climate-modes {
  display: flex;
  flex: none;
  gap: 0.25rem;
  height: var(--home-climate-modes-height, 2.5rem);
  padding: 0.25rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
}

.home-climate-modes__option {
  display: grid;
  place-items: center;
  flex: 1 0 auto;
  padding: 0 0.875rem;
  border-radius: 9999px;
  color: var(--text-secondary-color);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.home-climate-modes__option--icon {
  padding: 0 0.625rem;
}

.home-climate-modes__option--selected {
  background: var(--text-color);
  color: var(--p-content-background);
}

.home-climate-modes__option:disabled {
  cursor: default;
}

.home-climate-modes__option:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-climate-modes__icon {
  width: 1.125rem;
  height: 1.125rem;
}
</style>
