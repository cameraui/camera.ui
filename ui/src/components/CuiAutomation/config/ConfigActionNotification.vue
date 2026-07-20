<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.notification_title') }}</label>
      <InputText :model-value="data.title" :placeholder="t('components.automation_nodes.notification_title_placeholder')" @update:model-value="update('title', $event)" />
      <VariableSuggestions :variables="availableVars" @select="insertInto('title', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.notification_body') }}</label>
      <Textarea
        :model-value="data.body"
        :placeholder="t('components.automation_nodes.notification_body_placeholder')"
        rows="3"
        class="w-full"
        @update:model-value="update('body', $event)"
      />
      <VariableSuggestions :variables="availableVars" @select="insertInto('body', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.notification_severity') }}</label>
      <Select
        :model-value="data.severity ?? 'info'"
        :options="severityOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('severity', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.notification_image') }}</label>
      <div class="flex gap-2">
        <VariableInput
          :model-value="data.image ?? ''"
          :node-id="nodeId"
          :placeholder="t('components.automation_nodes.notification_image_placeholder')"
          class="flex-1"
          @update:model-value="update('image', $event)"
        />
        <Button
          v-tooltip.top="t('components.automation_nodes.image_upload')"
          severity="secondary"
          outlined
          class="shrink-0 h-[42px] w-[42px] p-0"
          @click="triggerUpload"
        >
          <template #icon><i-mdi:upload class="w-4 h-4" /></template>
        </Button>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
      </div>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
        t('components.automation_nodes.notification_image_hint')
      }}</Message>
      <div v-if="previewUrl" class="rounded-lg overflow-hidden border-[1px] border-color bg-black">
        <img :src="previewUrl" class="w-full max-h-32 object-cover" />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.notification_deep_link') }}</label>
      <InputText :model-value="data.deepLink" placeholder="/cameras/cam-1" @update:model-value="update('deepLink', $event)" />
      <VariableSuggestions :variables="availableVars" @select="insertInto('deepLink', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.notification_targets') }}</label>
      <span class="text-xs text-muted-color">{{ t('components.automation_nodes.notification_targets_hint') }}</span>
      <MultiSelect
        :model-value="data.targets ?? []"
        :options="deviceOptions"
        option-label="label"
        option-value="id"
        :loading="devicesLoading"
        :placeholder="t('components.automation_nodes.notification_targets_placeholder')"
        display="chip"
        filter
        class="w-full"
        @update:model-value="update('targets', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NotificationsQuery } from '@/api/routes/notifications.js';

import { useFlowVariables } from './flowSchema.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { ConfigActionNotificationProps, ConfigNodeUpdateEmits } from '../types.js';

const notificationsQuery = new NotificationsQuery();

const props = defineProps<ConfigActionNotificationProps>();
const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { data: devices, isLoading: devicesLoading } = notificationsQuery.listDevicesQuery();

const severityOptions = [
  { label: t('components.automation_nodes.severity_info'), value: 'info' },
  { label: t('components.automation_nodes.severity_warning'), value: 'warn' },
  { label: t('components.automation_nodes.severity_error'), value: 'error' },
  { label: t('components.automation_nodes.severity_critical'), value: 'critical' },
];

const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const deviceOptions = computed(() => (devices.value ?? []).map((d) => ({ id: d.id, label: d.name })));

const { options: availableVars } = useFlowVariables(() => props.nodeId);

const previewUrl = computed(() => {
  const src = props.data.image;
  if (!src) return undefined;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('data:')) return src;
  if (src.length > 100 && !src.startsWith('{{')) return `data:image/jpeg;base64,${src}`;
  return undefined;
});

function insertInto(field: 'title' | 'body' | 'deepLink', variable: string) {
  const current = (props.data[field] as string) ?? '';
  emit('update:data', { [field]: current + variable });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}

function triggerUpload() {
  fileInput.value?.click();
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = (reader.result as string).split(',')[1];
    if (base64) emit('update:data', { image: base64 });
  };
  reader.readAsDataURL(file);
}
</script>
