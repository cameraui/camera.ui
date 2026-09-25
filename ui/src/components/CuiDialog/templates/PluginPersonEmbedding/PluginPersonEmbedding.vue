<template>
  <div>
    <div class="relative mb-4 rounded-xl overflow-hidden w-fit mx-auto">
      <img :src="src" alt="Person re-ID test image" class="block max-w-full max-h-[50vh] w-auto object-contain" />
    </div>

    <div class="text-sm text-muted mb-4">
      {{ dimensions }}-dim
      <span v-if="embeddingModel" class="ml-1">({{ embeddingModel }})</span>
    </div>

    <Button v-if="onSearch" class="cui-button-medium w-full" :label="$t('components.person_embedding_interface.search')" @click="search" />
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { Ref } from 'vue';
import type { PluginPersonEmbeddingProps } from './types.js';

const props = defineProps<PluginPersonEmbeddingProps>();

const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef')!;

function search(): void {
  dialogRef.value.close();
  props.onSearch?.();
}

defineExpose<CustomDialogComponent>({});
</script>
