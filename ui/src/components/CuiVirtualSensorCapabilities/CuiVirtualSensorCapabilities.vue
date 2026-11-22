<template>
  <CuiVirtualCapabilitiesField v-model="capabilities" :type />
  <CuiVirtualSourcesField v-model="sources" :type :capabilities />
  <CuiVirtualKindField v-model="kind" :type />
</template>

<script setup lang="ts">
import { MediaPlayerProperty } from '@camera.ui/sdk';

import { SensorsQuery } from '@/api/routes/sensors.js';
import CuiVirtualCapabilitiesField from '@/components/CuiVirtualCapabilitiesField/CuiVirtualCapabilitiesField.vue';
import CuiVirtualKindField from '@/components/CuiVirtualKindField/CuiVirtualKindField.vue';
import { pickedKind } from '@/components/CuiVirtualKindField/types.js';
import CuiVirtualSourcesField from '@/components/CuiVirtualSourcesField/CuiVirtualSourcesField.vue';

import type { PatchSensorInput } from '@shared/types';
import type { CuiVirtualSensorCapabilitiesProps } from './types.js';

const props = defineProps<CuiVirtualSensorCapabilitiesProps>();

const capabilities = ref([...props.capabilities]);
const sources = ref((props.propertySpecs[MediaPlayerProperty.Source]?.choices ?? []).map((choice) => choice.label));
const kind = ref(pickedKind(props.type, props.propertySpecs));

const toast = useCuiToast();
const { mutateAsync: patchSensor } = new SensorsQuery().patchSensorQuery();

watchDebounced(capabilities, (next) => applyNow({ capabilities: next }), { debounce: 300 });
watchDebounced(sources, (next) => applyNow({ sources: next }), { debounce: 300 });
watch(kind, (next) => {
  if (next) applyNow({ kind: next });
});

async function applyNow(data: PatchSensorInput) {
  try {
    await patchSensor({ id: props.sensorId, data });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}
</script>
