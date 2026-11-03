<template>
  <div class="flex flex-col gap-4 w-full">
    <div v-if="props.cropUrl" class="flex justify-center">
      <div class="relative">
        <img :src="props.cropUrl" :alt="displayOldName" class="w-36 h-36 rounded-xl object-cover bg-neutral-900" />
        <span v-if="props.confidence" class="absolute bottom-1 right-1 text-xs font-medium px-1 rounded bg-black/60" :class="confidenceColor">
          {{ Math.round(props.confidence * 100) }}%
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-2 w-full">
      <label class="cui-label">{{ $t('views.recordings.reassign_current') }}</label>
      <InputText :model-value="displayOldName" class="w-full" fluid disabled />
    </div>

    <div class="flex flex-col gap-2 w-full">
      <label for="reassignTarget" class="cui-label">{{ $t('views.recordings.reassign_new') }}</label>
      <Select
        id="reassignTarget"
        v-model="selected"
        :options="options"
        option-label="label"
        option-value="value"
        class="w-full"
        fluid
        :loading="namesLoading"
        :disabled="namesLoading"
        :placeholder="$t('views.faces.enter_or_pick_name')"
      />
    </div>

    <Message v-if="warning" severity="warn" size="small" :closable="false">{{ warning }}</Message>
  </div>
</template>

<script setup lang="ts">
import { useFaceActions } from '@camera.ui/nvr';

import { FACE_CLARITY_CLEAR, FACE_CLARITY_UNCLEAR } from '@/common/constants.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { EventFaceCheck } from '@camera.ui/nvr';
import type { FaceReassignProps } from './types.js';

const props = defineProps<FaceReassignProps>();

const { t } = useI18n();
const { isAvailable, knownNames: loadKnownNames, checkEventFace } = useFaceActions();

const selected = ref<string | null>(null);
const knownNames = ref<string[]>([]);
const namesLoading = ref(true);
const check = ref<EventFaceCheck>();

const displayOldName = computed(() => (props.oldName === 'unknown' ? t('views.recordings.reassign_unknown_person') : props.oldName));

const confidenceColor = computed(() => {
  const confidence = props.confidence ?? 0;
  if (confidence >= 0.9) return 'text-green-400';
  if (confidence >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
});

const warning = computed(() => {
  const found = check.value;
  if (!found || selected.value === '') return '';
  const clarity = found.clarity ?? 1;
  if (clarity < FACE_CLARITY_UNCLEAR) return t('views.recordings.reassign_unclear');
  const filed = (found.alsoFiledUnder ?? []).filter((name) => name !== props.oldName && name !== selected.value);
  const lines: string[] = [];
  if (filed.length) lines.push(t('views.faces.assign_filed_under', { names: filed.join(', ') }, 1));
  if (clarity < FACE_CLARITY_CLEAR) lines.push(t('views.faces.assign_partly_visible', 1));
  return lines.join(' ');
});

const options = computed(() => {
  const opts = knownNames.value.filter((name) => name !== props.oldName).map((name) => ({ label: name, value: name }));
  if (props.oldName !== 'unknown') {
    opts.push({ label: t('views.recordings.reassign_unknown'), value: '' });
  }
  return opts;
});

async function loadCheck() {
  try {
    const options = props.attrIndex !== undefined ? { attrIndex: props.attrIndex } : undefined;
    check.value = await checkEventFace(props.eventId, props.segIndex, props.oldName, options);
  } catch {
    // ignore
  }
}

watch(
  isAvailable,
  async (available) => {
    if (!available) return;
    loadCheck();

    try {
      knownNames.value = await loadKnownNames();
    } catch {
      // the select stays empty, unknown-option still works
    } finally {
      namesLoading.value = false;
    }
  },
  { immediate: true },
);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => selected.value,
});
</script>
