<template>
  <SpeedDial :model direction="up" :transition-delay="80" :pt="{ root: { style: 'pointer-events: none' } }">
    <template #button="{ visible, toggleCallback }">
      <Button
        severity="secondary"
        rounded
        :loading
        class="pointer-events-auto"
        :class="subtle && ['dark-mode transition', visible ? 'opacity-100' : 'opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100']"
        @click="toggleCallback"
      >
        <template #icon>
          <div class="relative w-6 h-6">
            <div
              class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
              :class="{ 'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': visible }"
              :style="{ backgroundColor: 'var(--text-color)' }"
            />
            <div
              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
              :class="{ 'opacity-0 scale-0': visible }"
              :style="{ backgroundColor: 'var(--text-color)' }"
            />
            <div
              class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
              :class="{ 'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': visible }"
              :style="{ backgroundColor: 'var(--text-color)' }"
            />
          </div>
        </template>
      </Button>
    </template>
    <template #item="{ item }">
      <Button
        v-tooltip="{ value: item.label }"
        severity="secondary"
        v-bind="item.buttonProps"
        :loading
        rounded
        class="pointer-events-auto"
        @click="item.command?.({ originalEvent: $event, item })"
      >
        <template #icon>
          <component :is="item.icon" />
        </template>
      </Button>
    </template>
  </SpeedDial>
</template>

<script setup lang="ts">
import type { CuiSpeedDialProps } from './types.js';

defineProps<CuiSpeedDialProps>();
</script>
