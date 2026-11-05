<template>
  <div class="relative w-full h-full">
    <div
      v-if="hasZoom"
      ref="zoomRef"
      class="pointer-events-auto"
      :class="[
        'absolute left-4 bottom-4 bg-black/70 rounded-full flex flex-col items-center justify-center border border-white/10 shadow-md',
        size === 'small' ? 'w-12 h-24' : 'w-16 h-48',
      ]"
      @mousedown="activateZoom"
      @touchstart.prevent="activateZoom"
    >
      <div class="absolute text-muted" :class="size === 'small' ? 'top-1.5 text-sm' : 'top-4 text-lg'">
        <i-ic:round-plus />
      </div>
      <div class="absolute text-muted" :class="size === 'small' ? 'bottom-1.5 text-sm' : 'bottom-4 text-lg'">
        <i-ic:round-minus />
      </div>
      <div
        :class="['bg-white rounded-full absolute cursor-grab active:cursor-grabbing shadow-lg', size === 'small' ? 'w-8 h-8' : 'w-10 h-10']"
        :style="{
          transform: `translateY(${zoomUIPosition}px)`,
        }"
      />
    </div>

    <div
      v-if="hasPanTilt"
      ref="panTiltRef"
      class="pointer-events-auto"
      :class="[
        'absolute right-4 bottom-4 bg-black/70 rounded-full flex items-center justify-center border border-white/10 shadow-md',
        size === 'small' ? 'w-24 h-24' : 'w-32 h-32',
      ]"
      @mousedown="activatePanTilt"
      @touchstart.prevent="activatePanTilt"
    >
      <div class="absolute top-1" style="color: #646464">
        <i-ion:chevron-up-outline />
      </div>
      <div class="absolute bottom-1" style="color: #646464">
        <i-ion:chevron-down-outline />
      </div>
      <div class="absolute left-1" style="color: #646464">
        <i-ion:chevron-back-outline />
      </div>
      <div class="absolute right-1" style="color: #646464">
        <i-ion:chevron-forward-outline />
      </div>

      <div
        :class="[
          'bg-white rounded-full absolute cursor-grab active:cursor-grabbing shadow-lg transform -translate-x-1/2 -translate-y-1/2',
          size === 'small' ? 'w-8 h-8' : 'w-10 h-10',
        ]"
        :style="{
          left: `calc(50% + ${panTiltUIPosition.x}px)`,
          top: `calc(50% + ${panTiltUIPosition.y}px)`,
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PTZProperty } from '@camera.ui/sdk';

import { CUI_PTZ_CONTROL_DEFAULTS } from './types.js';
import { useCameraPtz } from './useCameraPtz.js';

import type { PTZDirection } from '@camera.ui/sdk';
import type { CuiPTZControlProps } from './types.js';

type PanTiltAxis = 'pan' | 'tilt';

const props = withDefaults(defineProps<CuiPTZControlProps>(), CUI_PTZ_CONTROL_DEFAULTS);

const { cameraDevice, size } = toRefs(props);

const log = useLogger();
const { sensor: ptzSensor, hasZoom, hasPanTilt } = useCameraPtz(cameraDevice);

const STOP: PTZDirection = { panSpeed: 0, tiltSpeed: 0, zoomSpeed: 0 };
const speedSteps = [0.1, 0.25, 0.45, 0.7, 1];
const axisSwitchRatio = 2;
const keepAliveInterval = 300;
const releaseGrace = 50;
const startSettle = 150;
const startMaxWait = 400;
const speedSettle = 500;
const speedMaxWait = 1000;

const panTiltRef = useTemplateRef('panTiltRef');
const zoomRef = useTemplateRef('zoomRef');

const panTiltUIPosition = reactive({ x: 0, y: 0 });
const zoomUIPosition = ref(0);
const isPanTiltActive = ref(false);
const isZoomActive = ref(false);

let panTiltTouchId: number | undefined;
let zoomTouchId: number | undefined;
let panTiltAxis: PanTiltAxis = 'pan';
let panTiltLevel = 0;
let zoomLevel = 0;
let panSpeed = 0;
let tiltSpeed = 0;
let zoomSpeed = 0;
let target = STOP;
let pending: PTZDirection | undefined;
let pendingSince = 0;
let sent = STOP;
let sending = false;
let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

const maxZoomOffset = computed(() => (size.value === 'small' ? 26 : 60));
const knobOffset = computed(() => (size.value === 'small' ? 10 : 15));

function isStop(velocity: PTZDirection): boolean {
  return velocity.panSpeed === 0 && velocity.tiltSpeed === 0 && velocity.zoomSpeed === 0;
}

function sameVelocity(a: PTZDirection, b: PTZDirection): boolean {
  return a.panSpeed === b.panSpeed && a.tiltSpeed === b.tiltSpeed && a.zoomSpeed === b.zoomSpeed;
}

function sameDirection(a: PTZDirection, b: PTZDirection): boolean {
  return Math.sign(a.panSpeed) === Math.sign(b.panSpeed) && Math.sign(a.tiltSpeed) === Math.sign(b.tiltSpeed) && Math.sign(a.zoomSpeed) === Math.sign(b.zoomSpeed);
}

function settleDelay(next: PTZDirection, waited: number): number {
  const fullSpeed = Math.max(Math.abs(next.panSpeed), Math.abs(next.tiltSpeed), Math.abs(next.zoomSpeed)) === 1;
  if (isStop(next) || fullSpeed) {
    return 0;
  }
  if (isStop(target) || !sameDirection(next, target)) {
    return Math.max(0, Math.min(startSettle, startMaxWait - waited));
  }
  return Math.max(0, Math.min(speedSettle, speedMaxWait - waited));
}

function speedLevel(magnitude: number, current: number): number {
  const exact = magnitude * speedSteps.length;
  if (exact < (current > 0 ? 0.25 : 0.5)) {
    return 0;
  }
  // a resting finger shakes a few pixels, a level changes only at the middle of the next one
  if (current > 0 && Math.abs(exact - current) < 1) {
    return current;
  }
  return Math.min(speedSteps.length, Math.max(1, Math.round(exact)));
}

function levelSpeed(level: number, direction: number): number {
  return level === 0 ? 0 : speedSteps[level - 1] * Math.sign(direction);
}

function pickAxis(pan: number, tilt: number): PanTiltAxis {
  const panAbs = Math.abs(pan);
  const tiltAbs = Math.abs(tilt);
  const ratio = panTiltLevel === 0 ? 1 : axisSwitchRatio;

  if (panTiltAxis === 'pan') {
    return panAbs * ratio >= tiltAbs ? 'pan' : 'tilt';
  }
  return tiltAbs * ratio >= panAbs ? 'tilt' : 'pan';
}

async function send(repeat = false): Promise<void> {
  // one command in flight, the loop sends the newest target once it lands
  if (sending || (!repeat && sameVelocity(target, sent))) {
    return;
  }

  sending = true;
  do {
    const velocity = target;
    try {
      await ptzSensor.value?.setProperty(PTZProperty.Velocity, velocity);
    } catch (error) {
      log.error('PTZ move failed:', error);
    }
    sent = velocity;
  } while (!sameVelocity(target, sent));
  sending = false;
}

function startKeepAlive(): void {
  if (keepAliveTimer) {
    return;
  }
  keepAliveTimer = setInterval(() => {
    send(true);
  }, keepAliveInterval);
}

function stopKeepAlive(): void {
  clearInterval(keepAliveTimer);
  keepAliveTimer = undefined;
}

function commit(next: PTZDirection): void {
  clearTimeout(settleTimer);
  pending = undefined;
  target = next;

  if (isStop(target)) {
    stopKeepAlive();
  } else {
    startKeepAlive();
  }
  send();
}

function updateTarget(): void {
  clearTimeout(releaseTimer);
  const next = { panSpeed, tiltSpeed, zoomSpeed };

  if (sameVelocity(next, target)) {
    clearTimeout(settleTimer);
    pending = undefined;
    return;
  }
  if (pending && sameVelocity(next, pending)) {
    return;
  }

  const now = Date.now();
  if (!pending) {
    pendingSince = now;
  }

  const delay = settleDelay(next, now - pendingSince);
  if (delay === 0) {
    commit(next);
    return;
  }
  clearTimeout(settleTimer);
  pending = next;
  settleTimer = setTimeout(() => commit(next), delay);
}

function updateZoomPosition(clientY: number): void {
  if (!zoomRef.value || !isZoomActive.value) {
    return;
  }

  const rect = zoomRef.value.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const maxOffset = maxZoomOffset.value;

  let offset = clientY - centerY;
  offset = Math.max(-maxOffset, Math.min(maxOffset, offset));

  zoomUIPosition.value = offset;

  // negative: pulling down zooms out
  const zoom = -offset / maxOffset;
  zoomLevel = speedLevel(Math.abs(zoom), zoomLevel);
  zoomSpeed = levelSpeed(zoomLevel, zoom);

  updateTarget();
}

function activateZoom(e: MouseEvent | TouchEvent): void {
  isZoomActive.value = true;

  if (e instanceof MouseEvent) {
    updateZoomPosition(e.clientY);
  } else {
    const touch = e.changedTouches[0];
    zoomTouchId = touch.identifier;
    updateZoomPosition(touch.clientY);
  }
}

function updatePanTiltPosition(clientX: number, clientY: number): void {
  if (!panTiltRef.value || !isPanTiltActive.value) {
    return;
  }

  const rect = panTiltRef.value.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  let uiX = clientX - rect.left - centerX;
  let uiY = clientY - rect.top - centerY;

  const radius = Math.min(centerX, centerY) - knobOffset.value;
  const distance = Math.sqrt(uiX * uiX + uiY * uiY);

  if (distance > radius) {
    uiX = (uiX / distance) * radius;
    uiY = (uiY / distance) * radius;
  }

  panTiltUIPosition.x = uiX;
  panTiltUIPosition.y = uiY;

  const pan = uiX / radius;
  // screen y grows downwards
  const tilt = -uiY / radius;

  // single-axis cameras move along the dominant axis only
  panTiltAxis = pickAxis(pan, tilt);
  panTiltLevel = speedLevel(Math.hypot(pan, tilt), panTiltLevel);
  panSpeed = panTiltAxis === 'pan' ? levelSpeed(panTiltLevel, pan) : 0;
  tiltSpeed = panTiltAxis === 'tilt' ? levelSpeed(panTiltLevel, tilt) : 0;

  updateTarget();
}

function activatePanTilt(e: MouseEvent | TouchEvent): void {
  isPanTiltActive.value = true;

  if (e instanceof MouseEvent) {
    updatePanTiltPosition(e.clientX, e.clientY);
  } else {
    const touch = e.changedTouches[0];
    panTiltTouchId = touch.identifier;
    updatePanTiltPosition(touch.clientX, touch.clientY);
  }
}

function findTouch(touches: TouchList, id: number | undefined): Touch | undefined {
  return id === undefined ? undefined : Array.from(touches).find((touch) => touch.identifier === id);
}

function releasePanTilt(): void {
  isPanTiltActive.value = false;
  panTiltTouchId = undefined;
  panTiltUIPosition.x = 0;
  panTiltUIPosition.y = 0;
  panTiltLevel = 0;
  panSpeed = 0;
  tiltSpeed = 0;
}

function releaseZoom(): void {
  isZoomActive.value = false;
  zoomTouchId = undefined;
  zoomUIPosition.value = 0;
  zoomLevel = 0;
  zoomSpeed = 0;
}

function scheduleStop(): void {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(updateTarget, releaseGrace);
}

function handleMouseMove(e: MouseEvent): void {
  if (isPanTiltActive.value) {
    updatePanTiltPosition(e.clientX, e.clientY);
  }
  if (isZoomActive.value) {
    updateZoomPosition(e.clientY);
  }
}

function handleTouchMove(e: TouchEvent): void {
  const panTiltTouch = findTouch(e.touches, panTiltTouchId);
  const zoomTouch = findTouch(e.touches, zoomTouchId);
  if (!panTiltTouch && !zoomTouch) {
    return;
  }

  e.preventDefault();
  if (panTiltTouch) {
    updatePanTiltPosition(panTiltTouch.clientX, panTiltTouch.clientY);
  }
  if (zoomTouch) {
    updateZoomPosition(zoomTouch.clientY);
  }
}

function handleMouseUp(): void {
  if (!isPanTiltActive.value && !isZoomActive.value) {
    return;
  }

  if (isPanTiltActive.value) {
    releasePanTilt();
  }
  if (isZoomActive.value) {
    releaseZoom();
  }
  scheduleStop();
}

function handleTouchEnd(e: TouchEvent): void {
  const panTiltEnded = findTouch(e.changedTouches, panTiltTouchId);
  const zoomEnded = findTouch(e.changedTouches, zoomTouchId);
  if (!panTiltEnded && !zoomEnded) {
    return;
  }

  if (panTiltEnded) {
    releasePanTilt();
  }
  if (zoomEnded) {
    releaseZoom();
  }
  scheduleStop();
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd);
  window.addEventListener('touchcancel', handleTouchEnd);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('touchend', handleTouchEnd);
  window.removeEventListener('touchcancel', handleTouchEnd);

  clearTimeout(releaseTimer);
  clearTimeout(settleTimer);
  stopKeepAlive();
  target = STOP;
  send();
});
</script>
