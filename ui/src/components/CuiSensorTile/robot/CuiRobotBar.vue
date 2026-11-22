<template>
  <div class="robot-bar">
    <CuiTileMiniButton
      v-if="main"
      :icon="main === VacuumCommand.Pause ? PauseIcon : PlayIcon"
      :label="label(main)"
      :disabled="!interactive"
      @click="emit('command', main)"
    />
    <CuiTileMiniButton
      v-if="commands.includes(VacuumCommand.Dock)"
      :icon="DockIcon"
      :label="label(VacuumCommand.Dock)"
      :disabled="!interactive"
      @click="emit('command', VacuumCommand.Dock)"
    />
  </div>
</template>

<script setup lang="ts">
import { VacuumCommand } from '@camera.ui/sdk';
import DockIcon from '~icons/mdi/home-import-outline';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';

import CuiTileMiniButton from '../frame/CuiTileMiniButton.vue';

import type { CuiRobotBarEmits, CuiRobotBarProps } from './types.js';

const props = defineProps<CuiRobotBarProps>();
const emit = defineEmits<CuiRobotBarEmits>();

const { t } = useI18n();

const main = computed(() => {
  if (props.busy && props.commands.includes(VacuumCommand.Pause)) return VacuumCommand.Pause;
  return props.commands.includes(VacuumCommand.Start) ? VacuumCommand.Start : undefined;
});

function label(command: string): string {
  return t(`components.automation_nodes.${props.type}_state_${command}`);
}
</script>

<style scoped>
.robot-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}
</style>
