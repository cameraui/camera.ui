<template>
  <div class="flex flex-col gap-2 w-full">
    <label for="roomName" class="cui-label">{{ $t('components.form.label.name') }}</label>
    <InputText id="roomName" v-model="roomName" class="w-full" :placeholder="$t('components.form.hint.room_select')" autofocus />
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';

const roomName = ref('');

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmed = roomName.value.trim();
    if (!trimmed) return null;
    return trimmed;
  },
});
</script>
