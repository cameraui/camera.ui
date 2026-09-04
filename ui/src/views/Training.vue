<template>
  <div class="flex flex-col h-full min-h-0">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t('views.training.title') }}
    </h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="center">
      <span class="font-semibold text-xl truncate">{{ $t('views.training.title') }}</span>
    </CuiTopbarSlot>

    <div class="flex gap-2 mb-4">
      <InputGroup class="flex-1">
        <IconField class="flex-1">
          <InputIcon>
            <i-carbon:search class="w-4 h-4" />
          </InputIcon>
          <InputText v-model="searchQuery" :placeholder="t('views.training.search')" class="w-full" />
        </IconField>
        <InputGroupAddon>
          <Button severity="secondary" text class="text-color" @click="cameraMenuRef?.toggleMenu($event)">
            <template #icon>
              <i-mdi:chevron-down class="w-4 h-4 transform transition-transform duration-300" :class="{ 'rotate-180': cameraMenuRef?.isOpen }" />
            </template>
          </Button>
        </InputGroupAddon>
      </InputGroup>

      <Button v-tooltip.left="{ value: $t('views.training.submissions') }" severity="secondary" outlined class="cui-button shrink-0" @click="openSubmissions">
        <template #icon>
          <i-mdi:cloud-check-outline class="w-4.5 h-4.5" />
        </template>
      </Button>

      <Button
        v-tooltip.left="{ value: $t('views.training.collection') }"
        severity="secondary"
        outlined
        class="cui-button shrink-0"
        @click="settingsMenuRef?.toggleMenu($event)"
      >
        <template #icon>
          <i-carbon:settings class="w-4.5 h-4.5" />
        </template>
      </Button>
    </div>

    <div v-if="uploadBanner" class="cui-card h-auto! shrink-0 px-3 py-2 mb-4 flex items-center gap-3">
      <template v-if="uploadBanner.active">
        <i-svg-spinners:ring-resize class="w-4 h-4 text-primary shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-sm">{{ $t('views.training.upload_progress', { done: uploadBanner.done + uploadBanner.failed, total: uploadBanner.total }) }}</div>
          <ProgressBar
            :value="uploadBanner.total ? Math.round(((uploadBanner.done + uploadBanner.failed) / uploadBanner.total) * 100) : 0"
            :show-value="false"
            style="height: 6px"
            class="mt-1.5"
          />
        </div>
      </template>
      <template v-else>
        <i-mdi:cloud-alert v-if="uploadBanner.failed" class="w-5 h-5 text-red-500 shrink-0" />
        <i-mdi:cloud-check v-else class="w-5 h-5 text-green-500 shrink-0" />
        <span class="flex-1 text-sm">
          {{ $t('views.training.submit_done', uploadBanner.done)
          }}<template v-if="uploadBanner.failed"> · {{ $t('views.training.upload_failed_summary', { count: uploadBanner.failed }) }}</template>
        </span>
        <Button severity="secondary" text rounded class="cui-icon-sm shrink-0" @click="trainingSocket.dismissProgress()">
          <template #icon><i-mdi:close class="w-4 h-4" /></template>
        </Button>
      </template>
    </div>

    <div v-if="candidates.isLoading.value && !candidates.data.value" class="grid w-full gap-3 p-px" :style="gridStyle">
      <div v-for="i in 8" :key="i" class="cui-card overflow-hidden">
        <Skeleton class="aspect-video" width="100%" height="100%" />
        <div class="p-3">
          <Skeleton height="14px" width="70%" class="mb-1" />
          <Skeleton height="12px" width="40%" />
        </div>
      </div>
    </div>

    <div v-else-if="filtered.length === 0" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-16">
      <i-material-symbols:model-training class="w-12 h-12 text-muted" />
      <span class="text-muted text-sm text-center max-w-md">{{ $t('views.training.no_candidates') }}</span>
    </div>

    <CuiRecordingsGrid
      v-else
      :items="gridItems"
      :min-item-width="smBreakpoint ? 220 : 250"
      :aspect-ratio="1.17"
      :gap="12"
      :has-more="hasMore"
      :load-more="loadMore"
      :item-key="(candidate: DBTrainingCandidate) => candidate.id"
      class="flex-1 min-h-0"
    >
      <template #item="{ item: candidate }">
        <Card
          class="cui-card overflow-hidden transition-shadow cursor-pointer hover:shadow-md h-full flex flex-col"
          :pt="{ header: { class: 'flex-1 min-h-0 flex' }, body: { class: 'shrink-0', style: 'height: auto' } }"
          @click="onCardClick(candidate)"
        >
          <template #header>
            <div class="relative flex-1 min-h-0 overflow-hidden bg-black/5 dark:bg-black/30">
              <CuiImage
                class="absolute inset-0"
                :src="imageUrl(candidate.id)"
                :alt="cameraName(candidate.cameraId)"
                image-container-class="w-full h-full"
                :image-style="{ objectFit: 'cover' }"
              />
              <div class="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
                <span
                  v-for="(count, label) in labelCounts(candidate)"
                  :key="label"
                  class="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                  :style="{ backgroundColor: detectionStyle(String(label)).color }"
                >
                  {{ labelText(String(label)) }} ×{{ count }}
                </span>
              </div>

              <div v-if="candidate.upload" class="absolute bottom-1.5 left-1.5">
                <Tag v-if="candidate.upload === 'failed'" v-tooltip.top="candidate.uploadError" severity="danger" :value="$t('views.training.upload_failed')" />
                <Tag v-else-if="candidate.upload === 'uploading'" severity="info" :value="$t('views.training.upload_uploading')" />
                <Tag v-else severity="secondary" :value="$t('views.training.upload_queued')" />
              </div>

              <div v-if="!selectionMode && !isLocked(candidate)" class="absolute top-1.5 right-1.5 dark-mode">
                <Button
                  v-tooltip.top="$t('views.training.delete_candidate')"
                  severity="secondary"
                  rounded
                  size="small"
                  class="cui-icon-sm text-white"
                  @click.stop="removeCandidate(candidate)"
                >
                  <template #icon><i-mdi:trash-can-outline width="100%" height="100%" /></template>
                </Button>
              </div>
            </div>
          </template>
          <template #content>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Checkbox
                  v-if="selectionMode && !isLocked(candidate)"
                  :model-value="selectedIds.has(candidate.id)"
                  binary
                  size="small"
                  @click.stop
                  @update:model-value="toggleSelection(candidate.id)"
                />
                <div class="min-w-0">
                  <div class="font-medium truncate">{{ cameraName(candidate.cameraId) }}</div>
                  <div class="text-xs text-muted">{{ formatRelativeTime(candidate.createdAt) }}</div>
                </div>
              </div>
              <Tag :severity="statusSeverity(candidate.status)" :value="$t(`views.training.status_${candidate.status}`)" />
            </div>
          </template>
        </Card>
      </template>
    </CuiRecordingsGrid>

    <CuiFloatingButtonGroup v-if="filtered.length || selectionMode" :force-visible="selectionMode">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('views.training.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelected ? $t('views.training.deselect_all') : $t('views.training.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('views.training.submit_selected') }"
          :button-props="{ disabled: !selectedVerifiedIds.length || submitCandidates.isPending.value }"
          :icon="SubmitIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmSubmit"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('views.training.delete_selected') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size || bulkBusy }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmBulkDelete"
        />
      </template>
    </CuiFloatingButtonGroup>

    <CuiMenu ref="cameraMenuRef" :items="cameraMenuItems" :popover="{ pt: { content: { class: 'p-0! rounded-xl! overflow-hidden!' } } }" />
    <CuiMenu
      ref="settingsMenuRef"
      :items="settingsMenuItems"
      :auto-hide="false"
      :popover="{ pt: { root: { class: 'w-[22rem]' }, content: { class: 'p-0! rounded-xl! overflow-hidden!' } } }"
    />
  </div>
</template>

<script setup lang="ts">
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import CloseIcon from '~icons/mdi/close';
import SubmitIcon from '~icons/mdi/cloud-upload-outline';
import TrashIcon from '~icons/mdi/delete-outline';
import SelectIcon from '~icons/tabler/dots-filled';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { TrainingQuery } from '@/api/routes/training.js';
import { detectionStyle } from '@/common/detectionLabels';
import { formatRelativeTime, notificationImageUrl } from '@/common/utils';
import TrainingBoxEditor from '@/components/CuiDialog/templates/TrainingBoxEditor/TrainingBoxEditor.vue';
import { TRAINING_BOX_EDITOR_DIALOG_SIZE } from '@/components/CuiDialog/templates/TrainingBoxEditor/types';
import TrainingSubmissions from '@/components/CuiDialog/templates/TrainingSubmissions/TrainingSubmissions.vue';
import { TRAINING_SUBMISSIONS_DIALOG_SIZE } from '@/components/CuiDialog/templates/TrainingSubmissions/types';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';

import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { DBTrainingCandidate, DBTrainingCandidateBox } from '@shared/types';

const camerasQuery = new CamerasQuery();
const trainingQuery = new TrainingQuery();

const { t, te } = useI18n();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { smBreakpoint } = useSharedCuiBreakpoint();

const candidates = trainingQuery.getCandidatesQuery();
const settings = trainingQuery.getSettingsQuery();
const patchCandidate = trainingQuery.patchCandidateMutation();
const deleteCandidate = trainingQuery.deleteCandidateMutation();
const patchSettings = trainingQuery.patchSettingsMutation();
const submitCandidates = trainingQuery.submitCandidatesMutation();
const trainingSocket = useTrainingSocket();
const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const PAGE_SIZE = 40;

const searchQuery = ref('');
const visibleCount = ref(PAGE_SIZE);
const cameraMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('cameraMenuRef');
const settingsMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('settingsMenuRef');

const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint.value ? '220px' : '260px'}, 1fr))` }));

const cameraMenuItems = computed<MenuItem[]>(() => {
  const names = [...new Set((candidates.data.value ?? []).map((c) => cameraName(c.cameraId)))].sort((a, b) => a.localeCompare(b));
  return [
    {
      key: 'all',
      label: t('views.training.all_cameras'),
      active: searchQuery.value === '',
      onClick: () => {
        searchQuery.value = '';
      },
    },
    ...names.map((name) => ({
      key: name,
      label: name,
      active: searchQuery.value === name,
      onClick: () => {
        searchQuery.value = name;
      },
    })),
  ];
});

const settingsMenuItems = computed<MenuItem[]>(() => [
  {
    key: 'collect',
    label: t('views.training.collection_enabled'),
    description: t('views.training.collection_hint'),
    toggle: true,
    toggleState: settings.data.value?.enabled ?? true,
    onClick: () => {
      setEnabled(!(settings.data.value?.enabled ?? true));
    },
  },
]);

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return candidates.data.value ?? [];
  return (candidates.data.value ?? []).filter((c) => cameraName(c.cameraId).toLowerCase().includes(query));
});

const gridItems = computed(() => filtered.value.slice(0, visibleCount.value));
const hasMore = computed(() => filtered.value.length > gridItems.value.length);

const pendingUploadCount = computed(() => (candidates.data.value ?? []).filter((c) => isLocked(c)).length);

const uploadBanner = computed(() => {
  if (trainingSocket.submitProgress.value) return trainingSocket.submitProgress.value;
  if (pendingUploadCount.value > 0) return { active: true, total: pendingUploadCount.value, done: 0, failed: 0 };
  return null;
});

const selectableCandidates = computed(() => filtered.value.filter((c) => !isLocked(c)));

function isLocked(candidate: DBTrainingCandidate): boolean {
  return candidate.upload === 'queued' || candidate.upload === 'uploading';
}

const { selectionMode, selectedIds, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  selectableCandidates,
  (candidate) => candidate.id,
);

const selectedVerifiedIds = computed(() => [...selectedIds.value].filter((id) => candidates.data.value?.find((c) => c.id === id)?.status === 'verified'));

function cameraName(cameraId: string): string {
  return camerasData.value?.result?.find((c) => c._id === cameraId)?.name ?? cameraId;
}

function imageUrl(id: string): string {
  return notificationImageUrl(`/api/training/candidates/${id}/image`) ?? '';
}

function labelText(label: string): string {
  const key = `components.training_editor.labels.${label}`;
  return te(key) ? t(key) : label;
}

function labelCounts(candidate: DBTrainingCandidate): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const box of candidate.boxes) counts[box.label] = (counts[box.label] ?? 0) + 1;
  return counts;
}

function statusSeverity(status: DBTrainingCandidate['status']): string {
  return status === 'verified' ? 'success' : 'info';
}

function loadMore(): void {
  visibleCount.value += PAGE_SIZE;
}

function onCardClick(candidate: DBTrainingCandidate): void {
  if (isLocked(candidate)) return;
  if (selectionMode.value) {
    toggleSelection(candidate.id);
    return;
  }
  openEditor(candidate);
}

function openEditor(candidate: DBTrainingCandidate): void {
  dialog.openComponentDialog(TrainingBoxEditor, {
    data: {
      title: t('views.training.title'),
      cancelText: t('components.form.button.remove'),
      confirmText: t('components.training_editor.verify'),
      cancelButtonProps: { severity: 'danger' },
      contentProps: {
        candidates: filtered.value.map((c) => ({ ...c })),
        startId: candidate.id,
        cameraName,
        imageUrl,
        onSave: async (id: string, boxes: DBTrainingCandidateBox[], status: DBTrainingCandidate['status']) => {
          await patchCandidate.mutateAsync({ id, patch: { boxes, status } });
        },
        onDelete: async (id: string) => {
          await deleteCandidate.mutateAsync(id);
        },
      },
    },
    dialogSize: TRAINING_BOX_EDITOR_DIALOG_SIZE,
  });
}

function openSubmissions(): void {
  dialog.openComponentDialog(TrainingSubmissions, {
    data: {
      title: t('views.training.submissions'),
      hideConfirmButton: true,
      cancelText: t('components.form.button.close'),
      contentProps: {},
    },
    dialogSize: TRAINING_SUBMISSIONS_DIALOG_SIZE,
  });
}

function confirmSubmit(): void {
  const ids = selectedVerifiedIds.value;
  if (!ids.length || submitCandidates.isPending.value) return;

  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.training.submit_confirm', { count: ids.length }),
      confirmText: t('views.training.submit'),
    },
    onConfirm: async () => {
      try {
        await submitCandidates.mutateAsync(ids);
        exitSelectionMode();
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 8000 });
      }
    },
  });
}

function confirmBulkDelete(): void {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkBusy.value) return;

  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.training.delete_selected_confirm', { count: ids.length }),
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      bulkBusy.value = true;
      try {
        for (const id of ids) await deleteCandidate.mutateAsync(id);
        exitSelectionMode();
        toast.add({ severity: 'success', detail: t('views.training.delete_selected_done', { count: ids.length }), life: 5000 });
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 5000 });
      } finally {
        bulkBusy.value = false;
      }
    },
  });
}

async function removeCandidate(candidate: DBTrainingCandidate): Promise<void> {
  await deleteCandidate.mutateAsync(candidate.id);
}

async function setEnabled(enabled: boolean): Promise<void> {
  await patchSettings.mutateAsync({ enabled });
}

watch(searchQuery, () => {
  visibleCount.value = PAGE_SIZE;
});

trainingSocket.connect();
const stopCandidatesListener = trainingSocket.onCandidatesChanged(() => {
  candidates.refetch();
});

onBeforeUnmount(() => {
  stopCandidatesListener();
});
</script>
