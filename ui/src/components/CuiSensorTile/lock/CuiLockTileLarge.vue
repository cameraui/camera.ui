<template>
  <CuiTilePanel :icon :title="name" :state="stateText" :color :active="jammed || wantsLocked" :offline="!online">
    <div class="flex flex-col items-center gap-3 py-2">
      <CuiHoldDial
        ref="dialRef"
        class="lock-dial"
        :class="{ 'lock-dial--closed': wantsLocked || jammed }"
        :label="name"
        :checked="wantsLocked"
        :active="wantsLocked || jammed"
        :holding
        :progress
        :spinning="moving"
        :interactive
        @keydown="onKey"
      >
        <svg class="lock-dial__padlock" :class="{ 'lock-dial__padlock--open': !wantsLocked && !jammed }" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M42 56 V40 a18 18 0 0 1 36 0 V56" class="lock-dial__shackle" />
          <rect x="30" y="54" width="60" height="44" rx="11" class="lock-dial__body" />
          <circle cx="60" cy="72" r="5" class="lock-dial__keyhole" />
          <rect x="58" y="74" width="4" height="10" rx="2" class="lock-dial__keyhole" />
        </svg>
      </CuiHoldDial>

      <Button v-if="jammed" severity="danger" size="small" class="cui-button-medium" :label="t('components.sensor_tile.retry')" :disabled="!interactive" @click="retry" />
      <span v-else-if="interactive" class="text-xs text-muted">{{ caption }}</span>
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiHoldDial from '../frame/CuiHoldDial.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useLock, useLockPress } from './useLock.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const lock = useLock(() => props.sensor);
const { jammed, wantsLocked, moving, color, stateText, retry } = lock;

const dialRef = useTemplateRef<ComponentPublicInstance>('dialRef');
const dialEl = computed(() => dialRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, onKey } = useLockPress(dialEl, lock, () => interactive.value);

const caption = computed(() => t(`components.sensor_tile.${wantsLocked.value ? 'hold_to_unlock' : 'tap_to_lock'}`));
</script>

<style scoped>
.lock-dial {
  width: 10rem;
  height: 10rem;
}

.lock-dial__padlock {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.lock-dial__shackle {
  fill: none;
  stroke: var(--text-secondary-color);
  stroke-width: 8;
  stroke-linecap: round;
  transition:
    transform 0.4s cubic-bezier(0.34, 1.4, 0.64, 1),
    stroke 0.3s ease;
}

.lock-dial__padlock--open .lock-dial__shackle {
  transform: translateY(-11px);
}

.lock-dial__body {
  fill: var(--text-secondary-color);
  transition: fill 0.3s ease;
}

.lock-dial--closed .lock-dial__shackle {
  stroke: var(--tile-ink);
}

.lock-dial--closed .lock-dial__body {
  fill: var(--tile-ink);
}

.lock-dial__keyhole {
  fill: var(--p-content-background);
}
</style>
