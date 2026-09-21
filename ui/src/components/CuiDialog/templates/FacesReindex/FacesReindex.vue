<template>
  <div class="flex flex-col gap-4">
    <span class="text-sm text-pretty">{{ message }}</span>

    <div v-if="started || running" class="flex flex-col gap-2">
      <ProgressBar :mode="checking ? 'indeterminate' : 'determinate'" :value="progressPercent" :show-value="false" class="h-2" />
      <div v-if="running && !checking" class="text-sm text-muted">
        {{ $t('views.faces.reindex.progress', { done: status?.done ?? 0, total: status?.total ?? 0 }) }}
      </div>
    </div>

    <span v-if="skippedNames.length" class="text-sm text-pretty text-muted">
      {{ $t('views.faces.reindex.skipped_pictures', { names: skippedNames.join(', ') }) }}
    </span>

    <span v-if="unusable.length" class="text-sm text-pretty text-muted">
      {{ $t('views.faces.reindex.unusable', { names: unusable.join(', ') }) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { useFacesReindex } from '@camera.ui/nvr';

import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';

const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { t } = useI18n();
const { status, isBusy, checking, refresh, start, cancel } = useFacesReindex();

const started = ref(false);
const finished = ref(false);
const fillValue = ref(0);

const running = computed(() => status.value?.running === true);
const unusable = computed(() => (running.value ? [] : (status.value?.unusable ?? [])));
const skippedNames = computed(() => (running.value ? [] : (status.value?.skippedNames ?? []).filter((name) => !unusable.value.includes(name))));

const message = computed(() => {
  if (finished.value) {
    if (!status.value?.total) return t('views.faces.reindex.up_to_date');
    const { done, total } = status.value;
    return t('views.faces.reindex.result', { done, total });
  }
  if (checking.value) return t('views.faces.reindex.checking');
  if (running.value) return t('views.faces.reindex.running_intro');
  return t('views.faces.reindex.intro');
});

const progressPercent = computed(() => {
  if (finished.value) return fillValue.value;
  const total = status.value?.total ?? 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((((status.value?.done ?? 0) + (status.value?.skipped ?? 0)) / total) * 100));
});

async function onConfirm(): Promise<null> {
  if (running.value) {
    cancel();
  } else {
    started.value = true;
    start();
  }
  return null;
}

watch(running, (now, was) => {
  if (!was || now || !started.value) return;
  finished.value = true;
  fillValue.value = status.value?.total ? 100 : 0;
  if (!status.value?.total) requestAnimationFrame(() => (fillValue.value = 100));
});

watchEffect(() => {
  if (dialogRefProps.hideConfirmButton) dialogRefProps.hideConfirmButton.value = finished.value;
  if (dialogRefProps.confirmText) {
    dialogRefProps.confirmText.value = running.value ? t('views.faces.reindex.stop') : t('views.faces.reindex.start');
  }
  if (dialogRefProps.confirmButtonProps) dialogRefProps.confirmButtonProps.value = running.value ? { severity: 'danger' } : {};
  if (dialogRefProps.disabled) dialogRefProps.disabled.value = isBusy.value;
});

onMounted(() => {
  if (status.value?.running) started.value = true;
  refresh().then(() => {
    if (status.value?.running) started.value = true;
  });
});

defineExpose<CustomDialogComponent>({ onConfirm });
</script>
