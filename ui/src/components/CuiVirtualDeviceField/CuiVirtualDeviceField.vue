<template>
  <div class="flex flex-col field-gap">
    <label for="virtualDevice" class="cui-label">{{ $t('views.sensors.device') }}</label>
    <Select id="virtualDevice" :model-value="picked" :options="options" option-label="label" option-value="value" class="w-full" @value-change="pick" />
    <InputText
      v-if="choice.newName !== null"
      :model-value="choice.newName"
      :placeholder="$t('views.sensors.device_name')"
      :aria-label="$t('views.sensors.device_name')"
      class="w-full"
      @update:model-value="(name) => (choice = { deviceId: null, newName: name ?? '' })"
    />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.sensors.device_hint') }}</Message>
  </div>
</template>

<script setup lang="ts">
import type { CuiVirtualDeviceFieldProps, VirtualDeviceChoice } from './types.js';

const props = defineProps<CuiVirtualDeviceFieldProps>();
const choice = defineModel<VirtualDeviceChoice>({ required: true });

const { t } = useI18n();

const NO_DEVICE = 'none';
const NEW_DEVICE = 'new';

const options = computed(() => [
  { label: t('views.sensors.device_none'), value: NO_DEVICE },
  ...props.devices,
  { label: t('views.sensors.device_new'), value: NEW_DEVICE },
]);

const picked = computed(() => {
  if (choice.value.newName !== null) return NEW_DEVICE;
  return choice.value.deviceId ?? NO_DEVICE;
});

function pick(value: string) {
  if (value === NEW_DEVICE) choice.value = { deviceId: null, newName: '' };
  else choice.value = { deviceId: value === NO_DEVICE ? null : value, newName: null };
}
</script>
