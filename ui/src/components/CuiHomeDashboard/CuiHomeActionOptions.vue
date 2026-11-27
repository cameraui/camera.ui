<template>
  <Button
    v-tooltip.top="t('views.home_dashboard.actions.options')"
    rounded
    size="small"
    severity="secondary"
    :aria-label="t('views.home_dashboard.actions.options')"
    @click="menuRef?.toggleMenu($event)"
  >
    <template #icon>
      <i-mdi:tune-variant />
    </template>
  </Button>

  <CuiMenu ref="menuRef" :items :auto-hide="false" dividers="sections" />
</template>

<script setup lang="ts">
import { useRecordingExport } from '@camera.ui/nvr';
import { HOME_ACTIONS } from '@shared/types';
import TimerIcon from '~icons/mdi/timer-outline';

import { actionDurations, allowedActions, HOME_ACTION_LOOKS, HOME_ACTION_MINUTES, useActionText } from './actions.js';

import type { DBHomeAction } from '@shared/types';
import type { MenuItem } from '../CuiMenu/types.js';
import type { CuiHomeActionOptionsEmits, CuiHomeActionOptionsProps } from './types.js';

const props = defineProps<CuiHomeActionOptionsProps>();
const emit = defineEmits<CuiHomeActionOptionsEmits>();

const { t } = useI18n();
const { say, durationLabel } = useActionText();
const { isAvailable: hasNvr } = useRecordingExport();

const admin = hasPermission(undefined, 'admin');

const menuRef = useTemplateRef('menuRef');

const items = computed<MenuItem[]>(() => {
  // no end last
  const durations = [...new Set(props.actions.flatMap(actionDurations))].sort((a, b) => (a || Infinity) - (b || Infinity));
  const durationItems = durations.map((minutes) => ({
    key: `minutes-${minutes}`,
    group: t('views.home_dashboard.actions.duration'),
    icon: TimerIcon,
    label: durationLabel(minutes),
    active: props.minutes === minutes,
    onClick: () => emit('update', { minutes: minutes === HOME_ACTION_MINUTES ? undefined : minutes }),
  }));

  const offered = allowedActions(HOME_ACTIONS, admin).filter((action) => action !== 'recording' || hasNvr.value || props.actions.includes(action));
  if (offered.length < 2) return durationItems;

  const actionItems = offered.map((action) => ({
    key: `action-${action}`,
    group: t('views.home_dashboard.actions.members'),
    icon: HOME_ACTION_LOOKS[action].icon,
    label: say(action, 'label'),
    toggle: true,
    toggleState: props.actions.includes(action),
    disabled: props.actions.length === 1 && props.actions.includes(action),
    onClick: () => toggle(action),
  }));
  return [...durationItems, ...actionItems];
});

function toggle(action: DBHomeAction) {
  const actions = props.actions.includes(action) ? props.actions.filter((entry) => entry !== action) : [...props.actions, action];
  emit('update', { actions });
}
</script>
