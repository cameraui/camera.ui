<template>
  <div class="detection-frame" :class="{ 'detection-frame--empty': !snapshotSrc && !showLive }">
    <CuiCameraCard
      v-if="showLive && cameraRecord"
      source-role="low-resolution"
      activity-mode="always-on"
      streaming-mode="auto"
      :camera-info="cameraRecord"
      :toolbar="false"
      :control="false"
      :subcontrol="false"
      :isolated-stream="true"
      :double-click-zoom="false"
      :bounding-box-overlay="false"
      card-click-action="none"
      live-indicator-overlay
      flat-card
      class="w-full"
    />
    <img v-else-if="snapshotSrc" :src="snapshotSrc" class="detection-frame__image" alt="" draggable="false" />

    <TransitionGroup v-if="!isPrivate" name="detection-box" tag="div" class="detection-frame__boxes">
      <div v-for="item in boxes" :key="item.key" class="detection-frame__box" :style="boxStyle(item)">
        <span v-if="item.text" class="detection-frame__label">{{ item.text }}</span>
      </div>
    </TransitionGroup>

    <div v-if="disabled" class="detection-frame__disabled">
      <i-fluent:video-off-32-filled class="w-9 h-9" />
      <span>{{ t('components.sensor_tile.camera_disabled') }}</span>
    </div>
    <div v-else-if="cameraRecord" class="detection-frame__toggle">
      <CuiTileCornerButton :label="live ? t('components.sensor_tile.show_snapshot') : t('components.sensor_tile.show_live')" @click="live = !live">
        <i-mdi:stop v-if="live" />
        <i-mdi:play v-else />
      </CuiTileCornerButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePrivacyActive } from '@/common/cameraPrivacy.js';

import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { useCameraRecord } from '../useCameraRecord.js';

import type { CuiDetectionFrameProps, DetectionBox } from './types.js';

const props = defineProps<CuiDetectionFrameProps>();

const { t } = useI18n();

const snapshotSrc = props.cameraId ? useSnapshot(props.cameraId).snapshotSrc : undefined;
const cameraRecord = useCameraRecord(props.cameraId);
const isPrivate = usePrivacyActive(cameraRecord);

const live = ref(false);

const showLive = computed(() => live.value && !props.disabled);

function boxStyle({ box, color }: DetectionBox) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
    '--box-color': color,
  };
}
</script>

<style scoped>
.detection-frame {
  position: relative;
  isolation: isolate;
  width: 100%;
  border-radius: 0.75rem;
  overflow: hidden;
  background: #000;
}

.detection-frame--empty {
  aspect-ratio: 16 / 9;
  background: var(--p-content-hover-background);
}

.detection-frame__image {
  display: block;
  width: 100%;
  height: auto;
}

.detection-frame__boxes {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}

.detection-frame__box {
  position: absolute;
  border: 2px solid var(--box-color);
  border-radius: 0.25rem;
  background: color-mix(in srgb, var(--box-color) 12%, transparent);
  transition:
    left 0.2s linear,
    top 0.2s linear,
    width 0.2s linear,
    height 0.2s linear;
}

.detection-frame__label {
  position: absolute;
  left: -2px;
  bottom: 100%;
  max-width: 12rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem 0.25rem 0.25rem 0;
  overflow: hidden;
  background: var(--box-color);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detection-frame__disabled {
  position: absolute;
  inset: 0;
  z-index: 21;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgb(0 0 0 / 0.7);
  color: rgb(255 255 255 / 0.7);
  font-size: 0.8125rem;
}

.detection-frame__toggle {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 21;
}

.detection-box-enter-active,
.detection-box-leave-active {
  transition: opacity 0.3s ease;
}

.detection-box-enter-from,
.detection-box-leave-to {
  opacity: 0;
}
</style>
