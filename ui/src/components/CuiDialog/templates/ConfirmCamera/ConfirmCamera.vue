<template>
  <div>
    <Form ref="formRef" class="flex flex-col w-full gap-6" :validation-schema="confirmCameraSchema">
      <div>
        <span class="card-title">{{ $t('components.dialog.components.new_camera.camera') }}</span>
        <Card class="cui-card">
          <template #content>
            <CuiCameraDetailsFields :form="cameraForm" :is-loading="isLoading">
              <div v-if="readOnlyInfo.length" class="flex flex-col gap-6">
                <div v-for="entry in readOnlyInfo" :key="entry.label" class="flex flex-col field-gap">
                  <label class="cui-label">{{ entry.label }}</label>
                  <InputGroup>
                    <InputText :model-value="entry.value" readonly type="text" />
                  </InputGroup>
                </div>
              </div>
            </CuiCameraDetailsFields>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('components.form.label.sources') }}</span>
        <Card class="cui-card border-color-inner" :pt="{ body: { class: 'pb-0' } }">
          <template #content>
            <CuiCameraSources :sources="cameraForm.sources" :is-loading="isLoading" :allow-add-remove-sources="true" />
          </template>
        </Card>
      </div>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { Form } from 'vee-validate';
import * as zod from 'zod';

import { normalizeSource } from '@/common/cameraSources.js';
import { deepToRaw } from '@/common/utils.js';

import type { DBCamera } from '@shared/types';
import type { ConfirmCameraForm, ConfirmCameraProps } from './types.js';

const confirmCameraSchema = zod
  .object({
    name: zod.string().trim().min(1),
  })
  .passthrough();

const props = defineProps<ConfirmCameraProps>();

const toast = useCuiToast();
const { t } = useI18n();

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const originalDraft = ref<DBCamera>(deepToRaw(props.draft));
const cameraForm = ref<ConfirmCameraForm>({
  name: originalDraft.value.name,
  type: originalDraft.value.type,
  room: originalDraft.value.room,
  info: originalDraft.value.info,
  sources: originalDraft.value.sources.map((source) => ({
    ...source,
    urls: [...source.urls],
  })),
});
const confirming = ref(false);

const readOnlyInfo = computed(() => {
  const entries: { label: string; value: string }[] = [];
  if (originalDraft.value.pluginInfo?.name) entries.push({ label: t('views.devices.plugin'), value: originalDraft.value.pluginInfo.name });
  if (originalDraft.value.nativeId) entries.push({ label: t('views.devices.native_id'), value: originalDraft.value.nativeId });
  return entries;
});

const isLoading = computed(() => confirming.value);

async function onSave(): Promise<void | null> {
  const result = await formRef.value?.validate();

  if (!result?.valid) {
    toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
    return null;
  }

  confirming.value = true;

  try {
    const draft: DBCamera = {
      ...originalDraft.value,
      name: cameraForm.value.name,
      type: cameraForm.value.type,
      room: cameraForm.value.room,
      info: cameraForm.value.info,
      sources: cameraForm.value.sources.map((source) => ({
        ...source,
        urls: source.urls.map(normalizeSource).filter(Boolean),
      })),
    };
    await props.onConfirm(draft);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('views.devices.confirm_title'), detail: error, life: 3000 });
    return null;
  } finally {
    confirming.value = false;
  }
}

defineExpose({
  isLoading,
  onConfirm: onSave,
});
</script>

<style scoped></style>
