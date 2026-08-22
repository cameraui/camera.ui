<template>
  <div class="flex flex-col gap-2 w-full">
    <label for="floorplanLevelName" class="cui-label">{{ $t('components.form.label.name') }}</label>
    <InputText id="floorplanLevelName" v-model="levelName" class="w-full" :placeholder="$t('views.floorplan.level_name_placeholder')" autofocus />
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { FloorplanLevelProps } from './types.js';

const props = withDefaults(defineProps<FloorplanLevelProps>(), { name: '' });

const levelName = ref(props.name);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmed = levelName.value.trim();
    if (!trimmed) return null;
    return trimmed;
  },
});
</script>
