<template>
  <div class="cui-media-player-control" :class="[`cui-media-player-control--${size}`, { 'cui-media-player-control--disabled': disabled }]">
    <div class="cui-media-player-control__header">
      <div class="cui-media-player-control__icon">
        <component :is="icon" class="cui-media-player-control__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-media-player-control__info">
        <span v-if="label" class="cui-media-player-control__label">{{ label }}</span>
        <span v-if="status" class="cui-media-player-control__status">{{ status }}</span>
      </div>

      <ToggleSwitch
        v-if="hasPower"
        :model-value="on"
        :disabled
        class="cui-media-player-control__toggle"
        @update:model-value="(value: boolean) => emit('update:on', value)"
      />
    </div>

    <div v-if="transport.length" class="cui-media-player-control__transport">
      <Button
        v-for="button in transport"
        :key="button.value"
        :disabled
        size="small"
        severity="secondary"
        text
        rounded
        :aria-label="button.label"
        @click="emit('command', button.value)"
      >
        <template #icon>
          <component :is="button.icon" />
        </template>
      </Button>
    </div>

    <div v-if="hasVolume || hasMute" class="cui-media-player-control__volume">
      <Button
        v-if="hasMute"
        :disabled
        size="small"
        severity="secondary"
        text
        rounded
        :aria-label="t('components.automation_nodes.sensor_property_muted')"
        @click="emit('update:muted', !muted)"
      >
        <template #icon>
          <i-mdi:volume-off v-if="muted" />
          <i-mdi:volume-high v-else />
        </template>
      </Button>

      <template v-if="hasVolume">
        <Slider v-model="volumeValue" :min="0" :max="100" :disabled class="w-full" />
        <span class="cui-media-player-control__row-value">{{ volumeValue }} %</span>
      </template>
    </div>

    <div v-if="sources?.length" class="cui-media-player-control__row">
      <span class="cui-media-player-control__row-label">{{ t('components.automation_nodes.sensor_property_source') }}</span>
      <Select
        :model-value="source"
        :options="sources"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value: string) => emit('update:source', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { MediaPlayerCommand } from '@camera.ui/sdk';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';
import NextIcon from '~icons/mdi/skip-next';
import PreviousIcon from '~icons/mdi/skip-previous';
import StopIcon from '~icons/mdi/stop';

import { useRestingValue } from '@/composables/useRestingValue.js';
import { CUI_MEDIA_PLAYER_CONTROL_DEFAULTS } from './types.js';

import type { Component } from 'vue';
import type { CuiMediaPlayerControlEmits, CuiMediaPlayerControlProps } from './types.js';

const props = withDefaults(defineProps<CuiMediaPlayerControlProps>(), CUI_MEDIA_PLAYER_CONTROL_DEFAULTS);
const emit = defineEmits<CuiMediaPlayerControlEmits>();

const { t } = useI18n();

const { volume, commands, playing } = toRefs(props);

const COMMAND_ICONS: Record<MediaPlayerCommand, Component> = {
  [MediaPlayerCommand.Play]: PlayIcon,
  [MediaPlayerCommand.Pause]: PauseIcon,
  [MediaPlayerCommand.Stop]: StopIcon,
  [MediaPlayerCommand.Next]: NextIcon,
  [MediaPlayerCommand.Previous]: PreviousIcon,
};

const volumeValue = useRestingValue(volume, (value) => emit('update:volume', value));

const transport = computed(() => {
  const offered = new Map((commands.value ?? []).map((command) => [command.value, command]));
  // one button plays and pauses, it pauses while something plays
  const toggle = playing.value && offered.has(MediaPlayerCommand.Pause) ? MediaPlayerCommand.Pause : MediaPlayerCommand.Play;
  return [MediaPlayerCommand.Previous, toggle, MediaPlayerCommand.Stop, MediaPlayerCommand.Next].flatMap((value) => {
    const command = offered.get(value);
    return command ? [{ ...command, icon: COMMAND_ICONS[value] }] : [];
  });
});
</script>

<style scoped>
.cui-media-player-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-media-player-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-media-player-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-media-player-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-media-player-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-media-player-control__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cui-media-player-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-media-player-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cui-media-player-control__toggle {
  margin-left: auto;
  flex-shrink: 0;
}

.cui-media-player-control__transport {
  display: flex;
  justify-content: center;
  gap: 0.25rem;
}

.cui-media-player-control__volume {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-media-player-control__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
}

.cui-media-player-control__row-label {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-media-player-control__row-value {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.cui-media-player-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-media-player-control--small .cui-media-player-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-media-player-control--small .cui-media-player-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-media-player-control--small .cui-media-player-control__label {
  font-size: 0.75rem;
}

.cui-media-player-control--small .cui-media-player-control__status {
  font-size: 0.625rem;
}

.cui-media-player-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-media-player-control--large .cui-media-player-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-media-player-control--large .cui-media-player-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-media-player-control--large .cui-media-player-control__label {
  font-size: 1rem;
}

.cui-media-player-control--large .cui-media-player-control__status {
  font-size: 0.875rem;
}
</style>
