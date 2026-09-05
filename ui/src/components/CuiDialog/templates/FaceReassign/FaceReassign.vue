<template>
  <div class="flex flex-col gap-4 w-full">
    <div v-if="props.cropUrl" class="flex justify-center">
      <img :src="props.cropUrl" :alt="displayOldName" class="w-36 h-36 rounded-xl object-cover bg-neutral-900" />
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
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { FaceReassignProps } from './types.js';

const props = defineProps<FaceReassignProps>();

const { t } = useI18n();
const { plugin } = usePlugin('@camera.ui/camera-ui-nvr');

const selected = ref<string | null>(null);
const knownNames = ref<string[]>([]);
const namesLoading = ref(true);

const displayOldName = computed(() => (props.oldName === 'unknown' ? t('views.recordings.reassign_unknown_person') : props.oldName));

const options = computed(() => {
  const opts = knownNames.value.filter((name) => name !== props.oldName).map((name) => ({ label: name, value: name }));
  if (props.oldName !== 'unknown') {
    opts.push({ label: t('views.recordings.reassign_unknown'), value: '' });
  }
  return opts;
});

onMounted(async () => {
  try {
    const nvr = plugin.value as { listKnownFaces?: () => Promise<{ name: string }[]> } | undefined;
    const known = await nvr?.listKnownFaces?.();
    knownNames.value = (known ?? []).map((profile) => profile.name);
  } catch {
    // the select stays empty, unknown-option still works
  } finally {
    namesLoading.value = false;
  }
});

defineExpose<CustomDialogComponent>({
  onConfirm: async () => selected.value,
});
</script>
