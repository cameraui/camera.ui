<template>
  <div class="flex flex-col gap-2 w-full">
    <label for="personName" class="cui-label">{{ $t('views.faces.name') }}</label>
    <AutoComplete id="personName" v-model="name" :suggestions="filtered" class="w-full" fluid :placeholder="$t('views.faces.enter_name')" autofocus @complete="search" />
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { AutoCompleteCompleteEvent } from 'primevue/autocomplete';
import type { FaceNewPersonProps } from './types.js';

const props = defineProps<FaceNewPersonProps>();

const name = ref('');
const filtered = ref<string[]>([]);

function search(event: AutoCompleteCompleteEvent) {
  const query = event.query.toLowerCase();
  filtered.value = (props.knownNames ?? []).filter((n) => n.toLowerCase().includes(query));
}

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmed = name.value.trim();
    if (!trimmed) return null;
    return trimmed;
  },
});
</script>
