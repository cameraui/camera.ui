<template>
  <CuiVirtualDeviceField v-model="device" :devices="devices" class="w-full" />
</template>

<script setup lang="ts">
import CuiVirtualDeviceField from '@/components/CuiVirtualDeviceField/CuiVirtualDeviceField.vue';
import { isIncompleteChoice } from '@/components/CuiVirtualDeviceField/types.js';

import type { VirtualDeviceChoice } from '@/components/CuiVirtualDeviceField/types.js';
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { SensorGroupProps } from './types.js';

defineProps<SensorGroupProps>();

const { t } = useI18n();
const toast = useCuiToast();

const device = ref<VirtualDeviceChoice>({ deviceId: null, newName: '' });

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<VirtualDeviceChoice | null> => {
    if (isIncompleteChoice(device.value)) {
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }
    return device.value;
  },
});
</script>
