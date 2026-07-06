<template>
  <div class="flex flex-col gap-6">
    <div>
      <label class="cui-label">{{ $t('views.faces.name') }}</label>
      <InputText v-model.trim="name" :placeholder="$t('views.faces.enter_name')" class="w-full" autofocus />
    </div>

    <div>
      <label class="cui-label">{{ $t('views.faces.face_plugin') }}</label>
      <Select v-model="pluginName" :options="facePlugins" option-label="label" option-value="value" :placeholder="$t('views.faces.select_plugin')" class="w-full" />
    </div>

    <div>
      <label class="cui-label mb-1">Image</label>
      <div
        class="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
        @click="triggerFileInput"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <div v-if="!preview">
          <i-tabler:upload class="w-8 h-8 text-muted mx-auto mb-2" />
          <div class="text-sm text-muted">{{ $t('views.faces.drop_image') }}</div>
        </div>
        <div v-else>
          <img :src="preview" class="max-h-48 mx-auto rounded" />
        </div>
      </div>
      <input ref="fileInput" type="file" :accept="FACE_UPLOAD_ACCEPTED_FORMATS.join(',')" class="hidden" @change="onFileSelect" />
      <div v-if="error" class="text-xs text-red-500 mt-1">{{ error }}</div>
      <div class="flex items-center justify-center mt-2 text-xs text-muted">
        <span>({{ FACE_UPLOAD_MAX_FILE_SIZE_MB }}MB, {{ FACE_UPLOAD_ACCEPTED_FORMATS.join(', ') }})</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { hasInterface, PluginInterface } from '@camera.ui/sdk';

import { PluginsQuery } from '@/api/routes/plugins.js';
import { FACE_UPLOAD_ACCEPTED_FORMATS, FACE_UPLOAD_MAX_FILE_SIZE, FACE_UPLOAD_MAX_FILE_SIZE_MB } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { FaceUploadProps } from './types.js';

const pluginsQuery = new PluginsQuery();

const props = defineProps<FaceUploadProps>();

const { t } = useI18n();

const { data: extensions } = pluginsQuery.getPluginsExtensionsQuery({ page: 1, pageSize: -1 });

const name = ref('');
const pluginName = ref('');
const preview = ref('');
const rawBytes = ref<Uint8Array | null>(null);
const error = ref('');
const fileInput = ref<HTMLInputElement>();

const facePlugins = computed(() => {
  return (extensions.value?.result ?? [])
    .filter((ext) => hasInterface(ext.contract, PluginInterface.FaceDetection))
    .map((ext) => ({ label: ext.displayName, value: ext.pluginName }));
});

function triggerFileInput() {
  fileInput.value?.click();
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFile(file);
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
}

function validateFile(file: File): string | null {
  if (!FACE_UPLOAD_ACCEPTED_FORMATS.includes(file.type)) {
    return t('views.faces.invalid_format');
  }
  if (file.size > FACE_UPLOAD_MAX_FILE_SIZE) {
    return t('views.faces.file_too_large', { maxSize: FACE_UPLOAD_MAX_FILE_SIZE_MB });
  }
  return null;
}

function handleFile(file: File) {
  error.value = '';
  const validationError = validateFile(file);
  if (validationError) {
    error.value = validationError;
    rawBytes.value = null;
    preview.value = '';
    return;
  }

  const bufferReader = new FileReader();
  bufferReader.onload = () => {
    rawBytes.value = new Uint8Array(bufferReader.result as ArrayBuffer);
  };
  bufferReader.readAsArrayBuffer(file);

  const previewReader = new FileReader();
  previewReader.onload = () => {
    preview.value = previewReader.result as string;
  };
  previewReader.readAsDataURL(file);
}

watch(
  facePlugins,
  (options) => {
    if (!pluginName.value && options.length === 1) {
      pluginName.value = options[0].value;
    }
  },
  { immediate: true },
);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    if (!name.value || !pluginName.value || !rawBytes.value) return null;
    await props.onEnroll(name.value, rawBytes.value, pluginName.value);
    return true;
  },
});
</script>
