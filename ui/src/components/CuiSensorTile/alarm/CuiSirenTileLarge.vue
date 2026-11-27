<template>
  <CuiTilePanel fit :icon :title="name" :state="stateText" :color :active :offline="!online">
    <div class="flex flex-col items-center gap-3 py-2">
      <CuiHoldDial ref="dialRef" class="siren-dial" :label="name" :checked="active" :active :holding :progress :interactive @keydown="onKey">
        <svg class="siren-dial__siren" :class="{ 'siren-dial__siren--active': active }" viewBox="0 0 120 120" aria-hidden="true">
          <g class="siren-dial__beams">
            <path d="M60 58 L18 30 A50 50 0 0 0 14 52 Z" />
            <path d="M60 58 L102 30 A50 50 0 0 1 106 52 Z" />
          </g>
          <path d="M38 80 V62 a22 22 0 0 1 44 0 V80 Z" class="siren-dial__dome" />
          <rect x="30" y="80" width="60" height="12" rx="4" class="siren-dial__base" />
        </svg>
      </CuiHoldDial>

      <span v-if="interactive" class="text-xs text-muted">{{ t(`components.sensor_tile.${active ? 'tap_to_silence' : 'hold_to_sound'}`) }}</span>

      <CuiLevelBar
        v-if="hasVolume && !disabled"
        class="w-full"
        :value="ratio"
        :label="`${Math.round(ratio * 100)} %`"
        :aria-label="propertyLabel(SirenProperty.Volume)"
        :color
        :disabled="!interactive"
        @input="inputVolume"
        @commit="commitVolume"
      />
      <div v-else-if="hasVolume" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(SirenProperty.Volume) }}</span>
        <span class="text-sm font-semibold tabular-nums">{{ Math.round(ratio * 100) }} %</span>
      </div>

      <CuiTileHistoryTimeline :sensor :property="SirenProperty.Active" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { SirenProperty } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiHoldDial from '../frame/CuiHoldDial.vue';
import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileHistoryTimeline from '../frame/CuiTileHistoryTimeline.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useSiren, useSirenPress } from './useSiren.js';

import type { ComponentPublicInstance } from 'vue';
import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const siren = useSiren(() => props.sensor);
const { active, color, hasVolume, ratio, stateText, inputVolume, commitVolume, propertyLabel } = siren;

const dialRef = useTemplateRef<ComponentPublicInstance>('dialRef');
const dialEl = computed(() => dialRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, onKey } = useSirenPress(dialEl, siren, () => interactive.value);
</script>

<style scoped>
.siren-dial {
  width: 10rem;
  height: 10rem;
}

.siren-dial__siren {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.siren-dial__dome {
  fill: var(--text-secondary-color);
  transition: fill 0.3s ease;
}

.siren-dial__base {
  fill: color-mix(in srgb, var(--text-color) 70%, var(--p-content-background));
}

.siren-dial__siren--active .siren-dial__dome {
  fill: var(--tile-color);
}

.siren-dial__beams {
  fill: var(--tile-color);
  opacity: 0;
  transform-origin: 60px 58px;
  transition: opacity 0.3s ease;
}

.siren-dial__siren--active .siren-dial__beams {
  opacity: 0.35;
  animation: siren-turn 1.2s linear infinite;
}

@keyframes siren-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .siren-dial__siren--active .siren-dial__beams {
    animation: none;
  }
}
</style>
