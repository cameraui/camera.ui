<template>
  <div class="flex flex-col gap-2 w-full">
    <label for="apiTokenName" class="cui-label">{{ $t('views.settings.api_tokens.name_label') }}</label>
    <InputText id="apiTokenName" v-model="name" class="w-full" :placeholder="$t('views.settings.api_tokens.name_placeholder')" autofocus :invalid="isDuplicate" />
    <span v-if="isDuplicate" class="text-xs text-red-500">{{ $t('views.settings.api_tokens.name_exists') }}</span>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { CreateApiTokenProps } from './types.js';

const props = defineProps<CreateApiTokenProps>();

const name = ref('');

const isDuplicate = computed(() => props.existingNames.includes(name.value.trim()));

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmed = name.value.trim();
    if (!trimmed || isDuplicate.value) return null;
    return trimmed;
  },
});
</script>
