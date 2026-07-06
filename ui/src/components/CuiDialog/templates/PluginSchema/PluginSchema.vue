<template>
  <CuiSchema :schema-form="schema" :loading="isLoading" show-button @on-action="onAction" @on-form-submit="onFormSubmit" />
</template>

<script setup lang="ts">
import { useCameraStorage, usePluginStorage, useSensorStorage } from '@camera.ui/browser';

import { pluginMessageResponseTypeToToastType } from '@/common/utils.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { UseStorageReturn } from '@camera.ui/browser';
import type { SchemaConfig } from '@camera.ui/sdk';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { PluginSchemaProps, PluginSchemaStorageType } from './types.js';

const props = defineProps<PluginSchemaProps>();

const toast = useCuiToast();
const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef')!;
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { schemaConfig, pluginName, cameraName, buttonKey, sensorId, pluginId } = toRefs(props);

const pluginStorage = usePluginStorage(pluginName);
const cameraStorage = useCameraStorage(cameraName, pluginName);
const sensorStorage = useSensorStorage(cameraName, sensorId, pluginId);

const schema = ref<SchemaConfig>({ schema: [], config: {} });

const storageType = computed<PluginSchemaStorageType>(() => {
  if (cameraName.value && sensorId.value) return 'sensor';
  if (cameraName.value) return 'camera';
  return 'plugin';
});

const activeStorage = computed<UseStorageReturn>(() => {
  switch (storageType.value) {
    case 'sensor':
      return sensorStorage;
    case 'camera':
      return cameraStorage;
    default:
      return pluginStorage;
  }
});

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || activeStorage.value.isLoading.value));

async function onAction(state: { key: string }): Promise<void> {
  await activeStorage.value.setValue(state.key, undefined);
}

async function onFormSubmit(configData: Record<string, any>): Promise<void> {
  const payload = { ...schemaConfig.value.config, ...configData };

  const response = await activeStorage.value.submitValue(buttonKey.value, payload);

  if (response?.toast) {
    const type = pluginMessageResponseTypeToToastType(response.toast.type);
    toast.add({ severity: type, detail: response.toast.message, life: 3000 });
  }

  if (response?.schema && Object.keys(response.schema).length && schema.value) {
    schema.value.schema = response.schema;
  } else {
    dialogRef.value.close();
  }
}

watch(
  schemaConfig,
  (value) => {
    schema.value = value;
  },
  { deep: true, immediate: true },
);

defineExpose({
  isLoading,
});
</script>

<style scoped></style>
