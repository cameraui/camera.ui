<template>
  <div class="flex w-full flex-col field-gap">
    <label for="assistantScheduleModel" class="cui-label">{{ $t('views.settings.assistant_schedule_model_label') }}</label>
    <Select v-model="modelId" input-id="assistantScheduleModel" :options="models" option-label="name" option-value="_id" show-clear fluid :placeholder="fallback" />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_schedule_model_hint') }}</Message>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { AssistantScheduleModelProps } from './types.js';

const props = defineProps<AssistantScheduleModelProps>();

const modelId = ref(props.models.some((model) => model._id === props.modelId) ? (props.modelId ?? null) : null);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => ({ modelId: modelId.value ?? null }),
});
</script>
