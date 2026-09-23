<template>
  <div class="flex w-full flex-col field-gap">
    <label for="assistantProfileName" class="cui-label">{{ $t('views.assistant.profile_name_label') }}</label>
    <InputText id="assistantProfileName" v-model="name" :placeholder="$t('views.assistant.profile_name_placeholder')" maxlength="60" fluid autofocus />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.assistant.profile_save_hint') }}</Message>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { AssistantProfileNameProps } from './types.js';

const props = defineProps<AssistantProfileNameProps>();

const name = ref(props.name ?? '');

defineExpose<CustomDialogComponent>({
  onConfirm: async () => name.value.trim() || null,
});
</script>
