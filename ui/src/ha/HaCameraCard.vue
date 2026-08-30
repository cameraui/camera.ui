<template>
  <div v-if="problem" class="flex items-center gap-2 p-4 text-sm text-red-500">
    <i-mdi:alert-circle-outline class="h-5 w-5 shrink-0" />
    <span>{{ problem }}</span>
  </div>
  <HaCameraTile v-else-if="mode === 'snapshot'" :camera="camera ?? cameraName" :fill="fill" :fit="fit" :clickable="click !== 'none'" @open="onTileOpen" />
  <CuiCameraCard
    v-else
    :class="{ 'h-full': fill }"
    :camera-info="cameraName"
    :card-fit="fill ? fit : 'aspect'"
    :card-props="cardProps"
    flat-card
    :expandable-card="clickAction === 'expand'"
    :expanded="false"
    :card-click-action="clickAction"
    :router-link="routerLink"
    :control="config.controls !== false"
    :toolbar="toolbar"
    :toolbar-snapshot-button="true"
    :toolbar-detection-button="true"
    :toolbar-pip-toggle-button="false"
    :toolbar-settings-button="false"
    :toolbar-share-button="false"
    :toolbar-shortcuts-button="true"
    show-shortcuts
    :toolbar-zone-button="false"
    :toolbar-timeline-button="false"
    :camera-name-overlay="!toolbar"
    :live-indicator-overlay="!toolbar"
    :detection-indicator-overlay="config.detection_indicator !== false"
    :double-click-zoom="false"
    @expand="onExpand"
  />
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';
import CuiCameraCard from '@/components/CuiCameraCard/CuiCameraCard.vue';
import { useCuiDialog } from '@/composables/useCuiDialog.js';
import { openCameraDialog } from './dialog.js';
import HaCameraTile from './HaCameraTile.vue';
import { navigate, panelPath } from './nav.js';

import type { CuiCameraCardProps } from '@/components/CuiCameraCard/types.js';
import type { HaCameraAttributes, HaCameraCardConfig, HomeAssistant } from './types.js';

const props = defineProps<{
  hass: HomeAssistant;
  config: HaCameraCardConfig;
  attributes: HaCameraAttributes;
  entryId: string;
  fill?: boolean;
}>();

const dialog = useCuiDialog();
const camerasQuery = new CamerasQuery();

const cameraName = computed(() => props.attributes.camera_name ?? '');
const toolbar = computed(() => props.config.toolbar !== false);
const fill = computed(() => props.fill !== false);
const fit = computed(() => props.config.fit ?? 'contain');
const mode = computed(() => props.config.mode ?? 'snapshot');
const cardProps = computed<CuiCameraCardProps['cardProps']>(() => (fill.value ? { pt: { root: { class: { 'h-full': true } } } } : undefined));
const { data: camera } = camerasQuery.getCameraQuery(cameraName);

const problem = computed(() => {
  if (!props.config.entity) return 'No entity configured';
  if (!cameraName.value) return `Not a camera.ui camera: ${props.config.entity}`;
  return '';
});

const click = computed(() => {
  const requested = props.config.click ?? 'popup';
  if (requested === 'ha' && !panelPath(props.hass, props.entryId)) return 'popup';
  return requested;
});

const clickAction = computed<CuiCameraCardProps['cardClickAction']>(() => {
  if (click.value === 'ha') return 'redirect';
  if (click.value === 'popup') return 'expand';
  return 'none';
});

const routerLink = computed(() => (click.value === 'ha' ? `/cameras/${encodeURIComponent(cameraName.value)}` : undefined));

function onExpand(): void {
  if (camera.value) openCameraDialog(dialog, camera.value);
}

function onTileOpen(): void {
  if (click.value === 'ha' && routerLink.value) {
    const panel = panelPath(props.hass, props.entryId);
    if (panel) navigate(`${panel}${routerLink.value}`);
    return;
  }
  if (click.value === 'popup') onExpand();
}
</script>
