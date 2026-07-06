<template>
  <div class="relative w-full h-full">
    <div
      v-if="hasZoom"
      ref="zoomRef"
      class="pointer-events-auto"
      :class="[
        'absolute left-4 bottom-4 bg-black/70 rounded-full flex flex-col items-center justify-center border border-white/10 shadow-md',
        size === 'small' ? 'w-12 h-36' : 'w-16 h-48',
      ]"
      @mousedown="activateZoom"
      @touchstart.prevent="activateZoom"
    >
      <div class="absolute top-4 text-muted" :class="size === 'small' ? 'text-base' : 'text-lg'">
        <i-ic:round-plus />
      </div>
      <div class="absolute bottom-4 text-muted" :class="size === 'small' ? 'text-base' : 'text-lg'">
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
import { usePTZControl } from '@camera.ui/browser';
import { PTZCapability, PTZProperty } from '@camera.ui/sdk';

import { CUI_PTZ_CONTROL_DEFAULTS } from './types.js';

import type { PTZDirection } from '@camera.ui/sdk';
import type { CuiPTZControlEmits, CuiPTZControlProps, PTZPosition, ZoomLevel } from './types.js';

const props = withDefaults(defineProps<CuiPTZControlProps>(), CUI_PTZ_CONTROL_DEFAULTS);

const emit = defineEmits<CuiPTZControlEmits>();

const { cameraDevice, size } = toRefs(props);

const log = useLogger();
const { sensor: ptzSensor } = usePTZControl(cameraDevice);

const commandDebounceTime = 100; // ms - adjust based on expected network latency
const significantChangeThreshold = 0.05; // Minimum change required to send a new command
const panTiltSpeedFactor = 0.05; // How quickly pan/tilt accumulates per frame
const zoomSpeedFactor = 0.03; // How quickly zoom accumulates per frame

const panTiltRef = useTemplateRef('panTiltRef');
const zoomRef = useTemplateRef('zoomRef');

const panTiltUIPosition = reactive<PTZPosition>({ x: 0, y: 0 });
const panTiltPosition = reactive<PTZPosition>({ x: 0, y: 0 });
const lastPanTiltValues = reactive<PTZPosition>({ x: 0, y: 0 });
const isPanTiltActive = ref(false);
const isZoomActive = ref(false);
const zoomUIPosition = ref<ZoomLevel>(0);
const zoomValue = ref<ZoomLevel>(0);
const lastZoomValue = ref<ZoomLevel>(0);

const isCommandInProgress = ref(false);
const lastCommandTime = ref(0);

// Track last sent command values to avoid sending duplicate commands
const lastSentPanSpeed = ref(0);
const lastSentTiltSpeed = ref(0);
const lastSentZoomSpeed = ref(0);

// Current direction/velocity values for continuous movement
const currentPanDirection = ref(0);
const currentTiltDirection = ref(0);
const currentZoomDirection = ref(0);

// Track which axis is currently active (for cameras that can only move on one axis at a time)
const activeAxis = ref<'pan' | 'tilt' | 'none'>('none');

// Accumulated incremental values for pan, tilt and zoom
const accumulatedPan = ref(0);
const accumulatedTilt = ref(0);
const accumulatedZoom = ref(0);

const animationFrameId = ref<number | null>(null);
const lastUpdateTime = ref(Date.now());

const isControlActive = computed(() => isPanTiltActive.value || isZoomActive.value);

const maxZoomOffset = computed(() => (size.value === 'small' ? 45 : 60));
const knobOffset = computed(() => (size.value === 'small' ? 10 : 15));
const isLoading = computed(() => isCommandInProgress.value);

const hasPan = computed(() => ptzSensor.value?.hasCapability(PTZCapability.Pan) ?? false);
const hasTilt = computed(() => ptzSensor.value?.hasCapability(PTZCapability.Tilt) ?? false);
const hasZoom = computed(() => ptzSensor.value?.hasCapability(PTZCapability.Zoom) ?? false);
const hasPresets = computed(() => ptzSensor.value?.hasCapability(PTZCapability.Presets) ?? false);
const hasHome = computed(() => ptzSensor.value?.hasCapability(PTZCapability.Home) ?? false);
const hasPanTilt = computed(() => hasPan.value || hasTilt.value);

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeZoomValue(value: number): number {
  return roundToTwoDecimals(Math.max(0, Math.min(1, value)));
}

async function executeContinuousMove(velocity: PTZDirection): Promise<void> {
  const now = Date.now();

  // If a command is already in progress and it hasn't been too long, skip this command
  if (isCommandInProgress.value && now - lastCommandTime.value < commandDebounceTime) {
    return;
  }

  const normalizedVelocity: PTZDirection = {
    panSpeed: roundToTwoDecimals(velocity.panSpeed),
    tiltSpeed: roundToTwoDecimals(velocity.tiltSpeed),
    zoomSpeed: roundToTwoDecimals(velocity.zoomSpeed),
  };

  isCommandInProgress.value = true;
  lastCommandTime.value = now;

  try {
    await ptzSensor.value?.setProperty(PTZProperty.Velocity, normalizedVelocity);
  } catch (error) {
    log.error('PTZ continuous move failed:', error);
  } finally {
    isCommandInProgress.value = false;
  }
}

async function executeStop(): Promise<void> {
  const now = Date.now();

  isCommandInProgress.value = true;
  lastCommandTime.value = now;

  try {
    await ptzSensor.value?.setProperty(PTZProperty.Velocity, { panSpeed: 0, tiltSpeed: 0, zoomSpeed: 0 });
  } catch (error) {
    log.error('PTZ stop failed:', error);
  } finally {
    isCommandInProgress.value = false;
  }
}

function continuousMovementLoop(): void {
  const now = Date.now();
  const deltaTime = (now - lastUpdateTime.value) / 1000; // Convert to seconds
  lastUpdateTime.value = now;

  let needsUpdate = false;

  // Only update if there's an active control and we have a direction
  if (
    isPanTiltActive.value &&
    (Math.abs(currentPanDirection.value) >= significantChangeThreshold || Math.abs(currentTiltDirection.value) >= significantChangeThreshold)
  ) {
    // Apply pan/tilt increments based on current direction and time elapsed
    const panIncrement = currentPanDirection.value * panTiltSpeedFactor * deltaTime * 5;
    const tiltIncrement = currentTiltDirection.value * panTiltSpeedFactor * deltaTime * 5;

    // Update accumulated values, keeping them within -1 to 1 range
    accumulatedPan.value = Math.max(-1, Math.min(1, accumulatedPan.value + panIncrement));
    accumulatedTilt.value = Math.max(-1, Math.min(1, accumulatedTilt.value + tiltIncrement));

    const roundedPan = roundToTwoDecimals(accumulatedPan.value);
    const roundedTilt = roundToTwoDecimals(accumulatedTilt.value);

    if (panTiltPosition.x !== roundedPan || panTiltPosition.y !== roundedTilt) {
      panTiltPosition.x = roundedPan;
      panTiltPosition.y = roundedTilt;

      emit('panTiltChange', {
        x: panTiltPosition.x,
        y: panTiltPosition.y,
      });

      needsUpdate = true;
    }
  }

  if (isZoomActive.value && Math.abs(currentZoomDirection.value) >= significantChangeThreshold) {
    const zoomIncrement = currentZoomDirection.value * zoomSpeedFactor * deltaTime * 10;
    accumulatedZoom.value = Math.max(0, Math.min(1, accumulatedZoom.value + zoomIncrement));
    const roundedZoomValue = roundToTwoDecimals(accumulatedZoom.value);

    if (zoomValue.value !== roundedZoomValue) {
      zoomValue.value = roundedZoomValue;
      emit('zoomChange', roundedZoomValue);
      needsUpdate = true;
    }
  }

  // Send periodic PTZ commands if direction hasn't changed but we're still moving
  if (needsUpdate && isControlActive.value) {
    const nowInner = Date.now();
    if (nowInner - lastCommandTime.value >= commandDebounceTime * 2) {
      if (
        isPanTiltActive.value &&
        (Math.abs(currentPanDirection.value) >= significantChangeThreshold || Math.abs(currentTiltDirection.value) >= significantChangeThreshold)
      ) {
        const panValue = roundToTwoDecimals(currentPanDirection.value);
        const tiltValue = roundToTwoDecimals(currentTiltDirection.value);

        // For cameras that can only move on one axis at a time
        if (activeAxis.value === 'pan') {
          executeContinuousMove({ panSpeed: panValue, tiltSpeed: 0, zoomSpeed: 0 });
        } else if (activeAxis.value === 'tilt') {
          executeContinuousMove({ panSpeed: 0, tiltSpeed: tiltValue, zoomSpeed: 0 });
        } else {
          // Diagonal movement
          executeContinuousMove({ panSpeed: panValue, tiltSpeed: tiltValue, zoomSpeed: 0 });
        }
      } else if (isZoomActive.value && Math.abs(currentZoomDirection.value) >= significantChangeThreshold) {
        // Zoom direction value for speed control (still uses 0-1 range for ONVIF)
        const zoomDirection = normalizeZoomValue(Math.abs(currentZoomDirection.value));
        const isZoomingIn = currentZoomDirection.value > 0;
        executeContinuousMove({ panSpeed: 0, tiltSpeed: 0, zoomSpeed: isZoomingIn ? zoomDirection : -zoomDirection });
      }
    }
  }

  if (isControlActive.value) {
    animationFrameId.value = requestAnimationFrame(continuousMovementLoop);
  }
}

function startContinuousMovement(): void {
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
  }
  lastUpdateTime.value = Date.now();
  animationFrameId.value = requestAnimationFrame(continuousMovementLoop);
}

function stopContinuousMovement(): void {
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
}

async function stopMovement(): Promise<void> {
  // Small delay to prevent immediate stop when user is just trying to adjust
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (
    !isControlActive.value &&
    (Math.abs(lastSentPanSpeed.value) >= significantChangeThreshold ||
      Math.abs(lastSentTiltSpeed.value) >= significantChangeThreshold ||
      Math.abs(lastSentZoomSpeed.value) >= significantChangeThreshold)
  ) {
    currentPanDirection.value = 0;
    currentTiltDirection.value = 0;
    currentZoomDirection.value = 0;
    activeAxis.value = 'none';

    lastSentPanSpeed.value = 0;
    lastSentTiltSpeed.value = 0;
    lastSentZoomSpeed.value = 0;

    await executeStop();

    stopContinuousMovement();
  }
}

async function updateZoomPosition(clientY: number): Promise<void> {
  if (!zoomRef.value || !isZoomActive.value) {
    return;
  }

  const rect = zoomRef.value.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const maxOffset = maxZoomOffset.value;

  let offset = clientY - centerY;
  offset = Math.max(-maxOffset, Math.min(maxOffset, offset));

  zoomUIPosition.value = offset;

  // Map offset to zoom direction/intensity (-1 to 1). Negative because pulling down should zoom out.
  const zoomDirection = -offset / maxOffset;
  currentZoomDirection.value = zoomDirection;

  const roundedZoomDirection = roundToTwoDecimals(zoomDirection);

  // Only send command if direction is significant AND different from last sent value
  if (Math.abs(roundedZoomDirection) >= significantChangeThreshold && Math.abs(roundedZoomDirection - lastSentZoomSpeed.value) >= significantChangeThreshold) {
    lastSentZoomSpeed.value = roundedZoomDirection;

    // Determine direction (positive for in, negative for out) but keep value in 0-1 range
    const isZoomingIn = roundedZoomDirection > 0;
    const zoomSpeed = normalizeZoomValue(Math.abs(roundedZoomDirection));

    await executeContinuousMove({ panSpeed: 0, tiltSpeed: 0, zoomSpeed: isZoomingIn ? zoomSpeed : -zoomSpeed });
  } else if (isZoomActive.value && Math.abs(roundedZoomDirection) < significantChangeThreshold && Math.abs(lastSentZoomSpeed.value) >= significantChangeThreshold) {
    currentZoomDirection.value = 0;
    lastSentZoomSpeed.value = 0;
    await executeStop();
  }
}

function activateZoom(e: MouseEvent | TouchEvent): void {
  isZoomActive.value = true;
  lastUpdateTime.value = Date.now();

  // Sync the accumulated zoom with the current zoom value before starting movement
  accumulatedZoom.value = zoomValue.value;

  startContinuousMovement();

  if (e instanceof MouseEvent) {
    updateZoomPosition(e.clientY);
  } else {
    updateZoomPosition(e.touches[0].clientY);
  }
}

async function updatePanTiltPosition(clientX: number, clientY: number): Promise<void> {
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

  const panDirection = uiX / radius;
  // Negative because y-axis is inverted in screen coordinates
  const tiltDirection = -uiY / radius;

  // Determine dominant axis for cameras that can only move on one axis at a time
  const panAbs = Math.abs(panDirection);
  const tiltAbs = Math.abs(tiltDirection);

  if (panAbs >= significantChangeThreshold || tiltAbs >= significantChangeThreshold) {
    if (panAbs > tiltAbs) {
      activeAxis.value = 'pan';
      currentPanDirection.value = panDirection;
      currentTiltDirection.value = 0;
    } else {
      activeAxis.value = 'tilt';
      currentPanDirection.value = 0;
      currentTiltDirection.value = tiltDirection;
    }
  } else {
    activeAxis.value = 'none';
    currentPanDirection.value = 0;
    currentTiltDirection.value = 0;
  }

  // Remember last significant direction for release behavior
  if (panAbs > significantChangeThreshold || tiltAbs > significantChangeThreshold) {
    lastPanTiltValues.x = currentPanDirection.value;
    lastPanTiltValues.y = currentTiltDirection.value;
  }

  const panDiff = Math.abs(currentPanDirection.value - lastSentPanSpeed.value);
  const tiltDiff = Math.abs(currentTiltDirection.value - lastSentTiltSpeed.value);
  const isSignificantChange = panDiff >= significantChangeThreshold || tiltDiff >= significantChangeThreshold;
  const isSignificantMovement = Math.abs(currentPanDirection.value) >= significantChangeThreshold || Math.abs(currentTiltDirection.value) >= significantChangeThreshold;

  if (isSignificantMovement && isSignificantChange) {
    lastSentPanSpeed.value = currentPanDirection.value;
    lastSentTiltSpeed.value = currentTiltDirection.value;

    const panValue = roundToTwoDecimals(currentPanDirection.value);
    const tiltValue = roundToTwoDecimals(currentTiltDirection.value);

    if (activeAxis.value === 'pan') {
      await executeContinuousMove({ panSpeed: panValue, tiltSpeed: 0, zoomSpeed: 0 });
    } else if (activeAxis.value === 'tilt') {
      await executeContinuousMove({ panSpeed: 0, tiltSpeed: tiltValue, zoomSpeed: 0 });
    }
  } else if (
    isPanTiltActive.value &&
    !isSignificantMovement &&
    (Math.abs(lastSentPanSpeed.value) >= significantChangeThreshold || Math.abs(lastSentTiltSpeed.value) >= significantChangeThreshold)
  ) {
    currentPanDirection.value = 0;
    currentTiltDirection.value = 0;
    activeAxis.value = 'none';

    lastSentPanSpeed.value = 0;
    lastSentTiltSpeed.value = 0;

    await executeStop();
  }
}

function activatePanTilt(e: MouseEvent | TouchEvent): void {
  isPanTiltActive.value = true;
  lastUpdateTime.value = Date.now();

  startContinuousMovement();

  if (e instanceof MouseEvent) {
    updatePanTiltPosition(e.clientX, e.clientY);
  } else {
    updatePanTiltPosition(e.touches[0].clientX, e.touches[0].clientY);
  }
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
  e.preventDefault();
  if (isPanTiltActive.value) {
    updatePanTiltPosition(e.touches[0].clientX, e.touches[0].clientY);
  }
  if (isZoomActive.value) {
    updateZoomPosition(e.touches[0].clientY);
  }
}

function handlePointerUp(): void {
  if (isPanTiltActive.value) {
    isPanTiltActive.value = false;
    panTiltUIPosition.x = 0;
    panTiltUIPosition.y = 0;
  }

  if (isZoomActive.value) {
    lastZoomValue.value = zoomValue.value;
    isZoomActive.value = false;
    zoomUIPosition.value = 0;
  }

  stopMovement();
}

async function goToPreset(preset: string): Promise<void> {
  try {
    await ptzSensor.value?.setProperty(PTZProperty.TargetPreset, preset);
  } catch (error) {
    log.error('PTZ go to preset failed:', error);
  }
}

async function goToHome(): Promise<void> {
  try {
    // Go to home by setting position to origin
    await ptzSensor.value?.setProperty(PTZProperty.Position, { pan: 0, tilt: 0, zoom: 0 });
  } catch (error) {
    log.error('PTZ go home failed:', error);
  }
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handlePointerUp);
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handlePointerUp);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handlePointerUp);
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('touchend', handlePointerUp);

  stopContinuousMovement();
  executeStop();
});

defineExpose({
  goToPreset,
  goToHome,
  isLoading,
  hasPan,
  hasTilt,
  hasZoom,
  hasPresets,
  hasHome,
  hasPanTilt,
});
</script>
