<template>
  <div class="sensor-tile" :class="`sensor-tile--${size}`">
    <component :is="tile" v-if="tile" :sensor :size :disabled @expand="expand" />

    <Button
      v-else-if="size === 'small'"
      v-tooltip.top="{ value: `${name} · ${status}` }"
      severity="secondary"
      rounded
      class="cui-icon-lg shadow-sm"
      :class="{ 'opacity-50': !online, 'cursor-default': !actionable }"
      :aria-label="name"
      @click="runPrimary"
    >
      <template #icon>
        <component :is="icon" width="100%" height="100%" :style="tone" />
      </template>
    </Button>

    <CuiSensorControl v-else-if="size === 'large'" :sensor :disabled />

    <div v-else class="sensor-tile__row card-border" :class="{ 'opacity-60': !online }" @click="emit('open')">
      <button type="button" class="sensor-tile__icon" :style="iconFill" :disabled="!actionable" :aria-label="name" @click.stop="runPrimary">
        <component :is="icon" class="sensor-tile__icon-svg" :style="tone" />
      </button>
      <div class="sensor-tile__text">
        <span class="sensor-tile__name">{{ name }}</span>
        <span class="sensor-tile__status">{{ status }}</span>
      </div>
    </div>

    <template v-if="largeTile">
      <Popover ref="expandPopoverRef" class="w-[22rem] shadow-lg cui-rounded-corner" :pt="{ content: { class: 'p-4' } }">
        <component :is="largeTile" :sensor size="large" :disabled class="sensor-tile__expanded" />
      </Popover>

      <CuiBottomSheet v-model="sheetOpen">
        <component :is="largeTile" :sensor size="large" :disabled class="sensor-tile__expanded" />
      </CuiBottomSheet>
    </template>

    <Popover v-if="isSecurity && size !== 'large'" ref="securityPopoverRef" class="shadow-lg cui-rounded-corner" :pt="{ content: { class: 'p-2' } }">
      <div class="flex flex-col gap-1 min-w-[160px]">
        <Button
          v-for="mode in modes"
          :key="mode"
          severity="secondary"
          :outlined="currentMode !== mode"
          size="small"
          class="cui-button-medium"
          :label="t(securityModeLabelKey(mode))"
          @click="setMode(mode)"
        />
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { SecuritySystemProperty, SensorType } from '@camera.ui/sdk';

import { isSensorActive, sensorIcon, sensorStatus, sensorTone } from '@/common/sensorDisplay.js';
import CuiSensorControl from '@/components/CuiSensorControl/CuiSensorControl.vue';
import { securityModeLabelKey, securityModes, sensorHasPrimaryAction, setSecurityState, toggleSensor } from '@/components/CuiSensors/display.js';

import { SENSOR_TILES } from './tiles.js';

import type { CuiSensorTileEmits, CuiSensorTileProps } from './types.js';
import type { SecuritySystemState } from '@camera.ui/sdk';
import type { Popover } from 'openvue';

const props = withDefaults(defineProps<CuiSensorTileProps>(), {
  size: 'medium',
  disabled: false,
});

const emit = defineEmits<CuiSensorTileEmits>();

const { t } = useI18n();
const toast = useCuiToast();

const { mdBreakpoint } = useSharedCuiBreakpoint();

const securityPopoverRef = useTemplateRef<InstanceType<typeof Popover>>('securityPopoverRef');
const expandPopoverRef = useTemplateRef<InstanceType<typeof Popover>>('expandPopoverRef');

const sheetOpen = ref(false);

const tile = computed(() => SENSOR_TILES[props.sensor.type]?.[props.size]);
const largeTile = computed(() => (props.size === 'large' ? undefined : SENSOR_TILES[props.sensor.type]?.large));
const name = computed(() => props.sensor.displayName.value);
const online = computed(() => props.sensor.connected.value);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const tone = computed(() => sensorTone(props.sensor.type, props.sensor));
const status = computed(() => (online.value ? sensorStatus(props.sensor.type, props.sensor, t) : t('connection.offline')));
const actionable = computed(() => !props.disabled && online.value && sensorHasPrimaryAction(props.sensor.type));
const isSecurity = computed(() => props.sensor.type === SensorType.SecuritySystem);
const modes = computed(() => securityModes(props.sensor));
const currentMode = computed(() => props.sensor.getProperty(SecuritySystemProperty.TargetState));
const iconFill = computed(() => (isSensorActive(props.sensor) ? { background: `color-mix(in srgb, ${tone.value.color} 16%, transparent)` } : undefined));

function expand(event: Event) {
  if (mdBreakpoint.value) sheetOpen.value = true;
  else expandPopoverRef.value?.toggle(event, event.currentTarget);
}

function runPrimary(event: Event) {
  if (!actionable.value) return;
  if (isSecurity.value) return securityPopoverRef.value?.toggle(event);
  run(() => toggleSensor(props.sensor));
}

function setMode(mode: SecuritySystemState) {
  securityPopoverRef.value?.hide();
  run(() => setSecurityState(props.sensor, mode));
}

async function run(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}
</script>

<style scoped>
.sensor-tile {
  min-width: 0;
}

.sensor-tile__expanded {
  --tile-panel-padding: 0;
  --tile-panel-border: none;
  --tile-panel-background: transparent;
}

.sensor-tile__row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem;
  border-radius: 0.5rem;
  min-width: 0;
}

.sensor-tile__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  transition: background 0.2s ease;
}

.sensor-tile__icon:disabled {
  cursor: default;
}

.sensor-tile__icon-svg {
  width: 1.25rem;
  height: 1.25rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.sensor-tile__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sensor-tile__name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-tile__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
