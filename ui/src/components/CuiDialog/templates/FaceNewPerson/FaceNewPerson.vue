<template>
  <div class="flex flex-col gap-2 w-full">
    <Message v-if="warning" severity="warn" size="small" class="mb-2" :closable="false">{{ warning }}</Message>
    <label for="personName" class="cui-label">{{ $t('views.faces.name') }}</label>
    <AutoComplete
      id="personName"
      v-model="name"
      :suggestions="filtered"
      class="w-full"
      fluid
      dropdown
      dropdown-mode="blank"
      complete-on-focus
      :placeholder="$t('views.faces.enter_or_pick_name')"
      autofocus
      @complete="search"
    />
  </div>
</template>

<script setup lang="ts">
import { FACE_CLARITY_CLEAR, FACE_CLARITY_UNCLEAR } from '@/common/constants.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { AutoCompleteCompleteEvent } from 'primevue/autocomplete';
import type { FaceNewPersonProps } from './types.js';

const props = defineProps<FaceNewPersonProps>();

const { t } = useI18n();

const name = ref('');
const filtered = ref<string[]>([]);

const warning = computed(() => {
  const faces = props.faces ?? [];
  const total = faces.length;
  const filed = faces.filter((face) => face.alsoFiledUnder?.length);
  const partlyVisible = faces.filter((face) => {
    const clarity = face.clarity ?? 1;
    return clarity >= FACE_CLARITY_UNCLEAR && clarity < FACE_CLARITY_CLEAR;
  }).length;
  const lines: string[] = [];
  if (filed.length) {
    const names = [...new Set(filed.flatMap((face) => face.alsoFiledUnder ?? []))].join(', ');
    lines.push(t('views.faces.assign_filed_under', { names, affected: filed.length, total }, total));
  }
  if (partlyVisible) lines.push(t('views.faces.assign_partly_visible', { affected: partlyVisible, total }, total));
  return lines.join(' ');
});

function search(event: AutoCompleteCompleteEvent) {
  const query = event.query.trim().toLowerCase();
  const names = props.knownNames ?? [];
  filtered.value = query ? names.filter((n) => n.toLowerCase().includes(query)) : [...names];
}

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmed = name.value.trim();
    if (!trimmed) return null;
    return trimmed;
  },
});
</script>
