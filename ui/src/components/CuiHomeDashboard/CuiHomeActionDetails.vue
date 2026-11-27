<template>
  <div class="home-action-details">
    <section v-for="state in states" :key="state.action" class="home-action-details__action">
      <CuiHomeStatusRow
        :icon="isActionOn(state) ? HOME_ACTION_LOOKS[state.action].onIcon : HOME_ACTION_LOOKS[state.action].icon"
        :name="say(state.action, 'label')"
        :state="summaryOf(state)"
        :on="isActionOn(state)"
        :color="HOME_ACTION_LOOKS[state.action].color"
        :offline="state.mode === 'na'"
      >
        <CuiTileAction
          v-if="isActionOn(state)"
          class="home-action-details__resume"
          show-label
          :label="say(state.action, 'back')"
          :color="HOME_ACTION_LOOKS[state.action].color"
          :interactive="!state.pending"
          @click="emit('back', state.action)"
        />
      </CuiHomeStatusRow>

      <p v-if="state.mode === 'na'" class="home-action-details__hint">{{ t(`views.home_dashboard.actions.na_hint.${state.reason}`) }}</p>
      <div v-else class="home-action-details__durations" role="group" :aria-label="say(state.action, 'go_for')">
        <CuiTileHoldAction
          v-for="minutes in state.durations"
          :key="minutes"
          show-label
          :label="durationLabel(minutes)"
          :aria-label="goLabel(state.action, minutes)"
          :guarded="HOME_ACTION_LOOKS[state.action].hold"
          :interactive="!state.pending"
          @press="emit('go', state.action, minutes)"
        />
        <CuiTileAction
          v-if="state.mode === 'on' && state.until"
          show-label
          :icon="PlusIcon"
          :label="durationLabel(EXTEND_MINUTES)"
          :aria-label="t('views.home_dashboard.actions.extend')"
          :interactive="!state.pending"
          @click="emit('extend', state.action)"
        />
      </div>
    </section>

    <ul v-if="cameras.length" class="home-action-details__cameras">
      <li v-for="camera in cameras" :key="camera._id" class="home-action-details__camera">
        <span class="truncate text-sm text-color">{{ camera.name }}</span>
        <span class="home-action-details__camera-state">{{ cameraState(camera) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import PlusIcon from '~icons/mdi/plus';

import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';

import { EXTEND_MINUTES, HOME_ACTION_LOOKS, isActionOn, useActionText } from './actions.js';
import CuiHomeStatusRow from './groups/CuiHomeStatusRow.vue';

import type { DBCamera } from '@shared/types';
import type { CuiHomeActionDetailsEmits, CuiHomeActionDetailsProps } from './types.js';

const props = defineProps<CuiHomeActionDetailsProps>();
const emit = defineEmits<CuiHomeActionDetailsEmits>();

const { t } = useI18n();
const { say, goLabel, durationLabel, onText, summaryOf } = useActionText();

const cameras = computed(() => {
  const all = new Map(props.states.flatMap((state) => state.cameras.map((row) => [row.camera._id, row.camera] as const)));
  return [...all.values()];
});

function cameraState(camera: DBCamera): string {
  const on = props.states.flatMap((state) => {
    const row = state.cameras.find((entry) => entry.camera._id === camera._id);
    return row?.on ? [{ action: state.action, text: onText(state.action, row) }] : [];
  });
  if (props.states.length === 1) return on[0]?.text ?? say(props.states[0]!.action, 'idle');
  if (!on.length) return t('views.home_dashboard.actions.all_running_title');
  return on.map(({ action, text }) => t('views.home_dashboard.actions.member_state', { title: say(action, 'title'), state: text })).join(', ');
}
</script>

<style scoped>
.home-action-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.home-action-details__action {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.home-action-details .home-action-details__resume.tile-action {
  background: color-mix(in srgb, var(--tile-ink) 18%, var(--p-content-hover-background));
  color: var(--tile-ink);
}

.home-action-details__durations {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.home-action-details__durations :deep(.tile-action) {
  flex: 1 1 auto;
  height: 2.5rem;
}

.home-action-details__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary-color);
}

.home-action-details__cameras {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.home-action-details__camera {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}

.home-action-details__camera-state {
  flex-shrink: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary-color);
}
</style>
