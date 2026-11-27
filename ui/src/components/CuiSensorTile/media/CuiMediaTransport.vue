<template>
  <div class="transport" :class="{ 'transport--compact': compact }">
    <template v-for="button in buttons" :key="button.key">
      <CuiTileMiniButton v-if="compact" :icon="button.icon" :label="button.label" :disabled="!interactive" @click="emit('command', button.command)" />
      <CuiTileButton v-else :icon="button.icon" :label="button.label" :hero="button.key === 'main'" :active="button.key === 'main' && playing" :interactive @click="emit('command', button.command)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { MediaPlayerCommand } from '@camera.ui/sdk';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';
import NextIcon from '~icons/mdi/skip-next';
import PreviousIcon from '~icons/mdi/skip-previous';
import StopIcon from '~icons/mdi/stop';

import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileMiniButton from '../frame/CuiTileMiniButton.vue';

import type { CuiMediaTransportEmits, CuiMediaTransportProps, TransportButton } from './types.js';
import type { Component } from 'vue';

const props = defineProps<CuiMediaTransportProps>();
const emit = defineEmits<CuiMediaTransportEmits>();

const { t } = useI18n();

const buttons = computed(() => {
  const offered = new Set(props.commands);
  const main = mainCommand();
  const list: TransportButton[] = [];
  if (offered.has(MediaPlayerCommand.Previous)) list.push(button('previous', MediaPlayerCommand.Previous, PreviousIcon));
  if (main) list.push(button('main', main, main === MediaPlayerCommand.Play ? PlayIcon : main === MediaPlayerCommand.Pause ? PauseIcon : StopIcon));
  if (offered.has(MediaPlayerCommand.Next)) list.push(button('next', MediaPlayerCommand.Next, NextIcon));
  // stop next to a pause only fits the large view
  if (!props.compact && main !== MediaPlayerCommand.Stop && offered.has(MediaPlayerCommand.Stop)) list.push(button('stop', MediaPlayerCommand.Stop, StopIcon));
  return list;
});

function mainCommand(): string | undefined {
  const offered = new Set(props.commands);
  if (!props.playing) return offered.has(MediaPlayerCommand.Play) ? MediaPlayerCommand.Play : undefined;
  if (offered.has(MediaPlayerCommand.Pause)) return MediaPlayerCommand.Pause;
  return offered.has(MediaPlayerCommand.Stop) ? MediaPlayerCommand.Stop : undefined;
}

function button(key: string, command: string, icon: Component): TransportButton {
  return { key, command, icon, label: t(`components.automation_nodes.mediaPlayer_state_${command}`) };
}
</script>

<style scoped>
.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.transport--compact {
  justify-content: space-between;
  gap: 0.25rem;
}

</style>
