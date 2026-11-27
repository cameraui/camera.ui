<template>
  <Button
    v-tooltip.top="t('views.home_dashboard.camera_options')"
    rounded
    size="small"
    severity="secondary"
    :aria-label="t('views.home_dashboard.camera_options')"
    @click="menuRef?.toggleMenu($event)"
  >
    <template #icon>
      <i-mdi:tune-variant />
    </template>
  </Button>

  <CuiMenu ref="menuRef" :items :auto-hide="false" dividers="sections" />
</template>

<script setup lang="ts">
import FillIcon from '~icons/mdi/arrow-expand-all';
import NeverIcon from '~icons/mdi/cancel';
import CameraIcon from '~icons/mdi/cctv';
import CoverIcon from '~icons/mdi/crop';
import ContainIcon from '~icons/mdi/fit-to-screen-outline';
import SwipeIcon from '~icons/mdi/gesture-swipe-horizontal';
import MotionIcon from '~icons/mdi/motion-sensor';
import DetectionIcon from '~icons/mdi/target-account';
import TimerIcon from '~icons/mdi/timer-outline';

import type { DBCamviewCardFit, DBHomeCameraFollow } from '@shared/types';
import type { Component } from 'vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { CuiHomeCameraOptionsEmits, CuiHomeCameraOptionsProps } from './types.js';

const props = defineProps<CuiHomeCameraOptionsProps>();
const emit = defineEmits<CuiHomeCameraOptionsEmits>();

const { t } = useI18n();

const FITS: [DBCamviewCardFit, Component][] = [
  ['cover', CoverIcon],
  ['contain', ContainIcon],
  ['fill', FillIcon],
];
const ROTATE_SECONDS = [10, 30, 60];
const FOLLOWS: [DBHomeCameraFollow | undefined, Component][] = [
  [undefined, NeverIcon],
  ['motion', MotionIcon],
  ['detection', DetectionIcon],
];

const menuRef = useTemplateRef('menuRef');

const fit = computed(() => props.widget.fit ?? 'cover');
const group = computed(() => [props.camera._id, ...(props.widget.cameras ?? []).filter((id) => id !== props.camera._id)]);

const items = computed<MenuItem[]>(() => {
  const fits = FITS.map(([option, icon]) => ({
    key: `fit-${option}`,
    group: t('views.camview.card_fit'),
    icon,
    label: t(`views.camview.card_fit_${option}`),
    description: t(`views.camview.card_fit_${option}_info`),
    active: fit.value === option,
    onClick: () => emit('update', { fit: option }),
  }));
  if (props.cameras.length < 2) return fits;

  const switching = group.value.length > 1 ? [...rotateItems(), ...followItems()] : [];
  const cameras = props.cameras.map((entry) => ({
    key: `camera-${entry._id}`,
    group: t('views.home_dashboard.camera_group'),
    icon: CameraIcon,
    label: entry.name,
    description: entry.roomId ? props.roomNames.get(entry.roomId) : undefined,
    toggle: true,
    toggleState: group.value.includes(entry._id),
    disabled: entry._id === props.camera._id,
    onClick: () => toggle(entry._id),
  }));
  return [...fits, ...switching, ...cameras];
});

function rotateItems(): MenuItem[] {
  return [undefined, ...ROTATE_SECONDS].map((seconds) => ({
    key: `rotate-${seconds ?? 'off'}`,
    group: t('views.home_dashboard.camera_rotate'),
    icon: seconds ? TimerIcon : SwipeIcon,
    label: seconds ? rotateLabel(seconds) : t('views.home_dashboard.camera_rotate_off'),
    active: props.widget.rotate === seconds,
    onClick: () => emit('update', { rotate: seconds }),
  }));
}

function followItems(): MenuItem[] {
  return FOLLOWS.map(([follow, icon]) => ({
    key: `follow-${follow ?? 'off'}`,
    group: t('views.home_dashboard.camera_follow'),
    icon,
    label: t(`views.home_dashboard.camera_follow_${follow ?? 'off'}`),
    active: props.widget.follow === follow,
    onClick: () => emit('update', { follow }),
  }));
}

function rotateLabel(seconds: number): string {
  return seconds < 60
    ? t('views.home_dashboard.camera_rotate_seconds', { count: seconds })
    : t('views.home_dashboard.camera_rotate_minutes', { count: seconds / 60 }, seconds / 60);
}

function toggle(id: string) {
  const ids = group.value.includes(id) ? group.value.filter((entry) => entry !== id) : [...group.value, id];
  emit('update', { cameras: ids.length > 1 ? ids : undefined });
}
</script>
