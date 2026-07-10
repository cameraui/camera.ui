<template>
  <div class="flex flex-col gap-6">
    <div v-if="camera.address" class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.devices.address') }}</label>
      <InputText :model-value="camera.address" readonly />
    </div>

    <div v-if="schema.length === 0" class="text-center py-4">
      <p class="text-muted">{{ $t('views.devices.no_settings_required') }}</p>
    </div>
    <CuiSchema v-else ref="schemaFormRef" :schema-form="schemaForm" :loading="isLoading" />
  </div>
</template>

<script setup lang="ts">
import type CuiSchema from '@/components/CuiSchema/CuiSchema.vue';
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ConnectionSchemaProps } from './types.js';

const props = defineProps<ConnectionSchemaProps>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { schema } = toRefs(props);
const schemaFormRef = useTemplateRef<InstanceType<typeof CuiSchema>>('schemaFormRef');
const connecting = ref(false);

const schemaForm = computed(() => ({
  schema: schema.value,
  config: {},
}));

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || connecting.value));

async function onConfirm(): Promise<void | null> {
  connecting.value = true;

  try {
    let credentials: Record<string, unknown> = {};

    if (schema.value.length > 0) {
      const result = await schemaFormRef.value?.validate();

      if (!result?.valid) {
        log.error('Validation failed', result);
        toast.add({
          severity: 'error',
          detail: t('components.toast.validation_failed'),
          life: 3000,
        });
        return null;
      }

      credentials = result.values ?? {};
    }

    await props.onConnect(credentials);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('views.devices.connect'),
      detail: error,
      life: 3000,
    });
    return null;
  } finally {
    connecting.value = false;
  }
}

defineExpose({
  isLoading,
  onConfirm,
});
</script>

<style scoped></style>
