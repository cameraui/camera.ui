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
          <span class="flex items-center justify-center w-6 h-6">
            <CuiDotsIcon :open="visible" />
          </span>
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
