<template>
  <div class="detection-frame" :class="{ 'detection-frame--empty': !snapshotSrc }">
    <img v-if="snapshotSrc" :src="snapshotSrc" class="detection-frame__image" alt="" draggable="false" />
    <TransitionGroup name="detection-box">
      <div v-for="item in boxes" :key="item.key" class="detection-frame__box" :style="boxStyle(item)">
        <span v-if="item.text" class="detection-frame__label">{{ item.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import type { CuiDetectionFrameProps, DetectionBox } from './types.js';

const props = defineProps<CuiDetectionFrameProps>();

const snapshotSrc = props.cameraId ? useSnapshot(props.cameraId).snapshotSrc : undefined;

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

.detection-box-enter-active,
.detection-box-leave-active {
  transition: opacity 0.3s ease;
}

.detection-box-enter-from,
.detection-box-leave-to {
  opacity: 0;
}
</style>
