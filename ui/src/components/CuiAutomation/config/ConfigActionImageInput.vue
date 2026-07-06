<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.image_source') }}</label>
      <div class="flex gap-2">
        <VariableInput
          :model-value="data.source"
          :node-id="nodeId"
          :placeholder="t('components.automation_nodes.image_source_placeholder')"
          class="flex-1"
          @update:model-value="update('source', $event)"
        />
        <Button v-tooltip.top="t('components.automation_nodes.image_upload')" severity="secondary" outlined class="shrink-0 h-[42px] w-[42px] p-0" @click="triggerUpload">
          <template #icon><i-mdi:upload class="w-4 h-4" /></template>
        </Button>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
      </div>
      <VariableSuggestions :variables="availableVars" @select="update('source', (data.source ?? '') + $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.image_source_hint') }}</Message>
    </div>

    <div v-if="previewUrl" class="rounded-lg overflow-hidden border-[1px] border-color bg-black">
      <img :src="previewUrl" class="w-full max-h-32 object-cover" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.variable_name') }}</label>
      <InputText :model-value="data.variableName" placeholder="image" @update:model-value="update('variableName', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.image_variable_hint') }}</Message>
    </div>

    <Divider />

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.image_width') }}</label>
      <InputNumber :model-value="data.resizeWidth ?? 0" :min="0" :max="7680" class="w-full" @update:model-value="update('resizeWidth', $event)" />
    </div>
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.image_height') }}</label>
      <InputNumber :model-value="data.resizeHeight ?? 0" :min="0" :max="4320" class="w-full" @update:model-value="update('resizeHeight', $event)" />
    </div>
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.image_resize_hint') }}</Message>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.image_output_format') }}</label>
      <Select
        :model-value="data.outputFormat ?? 'jpeg'"
        :options="formatOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('outputFormat', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { getAvailableVariables } from './availableVariables.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { AutomationFlow, ConfigActionImageInputProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionImageInputProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const store = useAutomationsStore();

const formatOptions = [
  { label: 'JPEG', value: 'jpeg' },
  { label: 'Raw RGB', value: 'raw-rgb' },
  { label: 'Raw RGBA', value: 'raw-rgba' },
  { label: 'Raw Grayscale', value: 'raw-gray' },
];

const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const availableVars = computed(() => getAvailableVariables(store.draft as AutomationFlow | null, props.nodeId));

const previewUrl = computed(() => {
  const src = props.data.source;
  if (!src) return undefined;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('data:')) return src;
  if (src.length > 100 && !src.startsWith('{{')) return `data:image/jpeg;base64,${src}`;
  return undefined;
});

function triggerUpload() {
  fileInput.value?.click();
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = (reader.result as string).split(',')[1];
    if (base64) {
      emit('update:data', { source: base64 });
    }
  };
  reader.readAsDataURL(file);
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
