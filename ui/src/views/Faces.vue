<template>
  <div ref="reindexAnchorRef" class="flex flex-col">
    <div v-if="!smBreakpoint" class="flex items-center justify-between">
      <h1 class="page-title">
        {{ $t('views.faces.title') }}
      </h1>
    </div>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <template v-if="faceStore.isLoading.value">
      <section ref="knownSkeletonRef" class="mb-6 p-px">
        <Skeleton height="16px" width="140px" class="mb-3" />
        <div class="flex gap-3 p-px overflow-hidden">
          <div v-for="i in knownSkeletonCount" :key="i" class="cui-card overflow-hidden shrink-0" :style="{ width: `${KNOWN_CARD_WIDTH}px` }">
            <Skeleton class="aspect-square" width="100%" height="100%" />
            <div class="p-3">
              <Skeleton height="14px" width="70%" class="mb-1" />
              <Skeleton height="12px" width="40%" />
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <div v-if="!faceStore.isAvailable.value" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
        <i-mdi:face-recognition class="w-12 h-12 text-muted" />
        <span class="text-muted text-sm">{{ $t('views.faces.unavailable') }}</span>
      </div>

      <div
        v-else-if="!faceStore.knownFaces.value.length && !faceStore.unknownFaces.value.length && !faceStore.ignoredFaces.value.length"
        class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4"
      >
        <i-mdi:face-recognition class="w-12 h-12 text-muted" />
        <span class="text-muted text-sm">{{ $t('views.faces.no_faces_yet') }}</span>
      </div>

      <template v-else>
        <section class="mb-6 p-px">
          <div class="flex items-center justify-between mb-3">
            <span class="flex items-center gap-2">
              <span class="card-title m-0!">{{ $t('views.faces.known_faces') }}</span>
              <Badge size="small" class="rounded-full px-1.5" :value="String(faceStore.knownFaces.value.length)" />
            </span>
          </div>

          <div v-if="faceStore.knownFaces.value.length" ref="knownContainerRef" class="relative min-w-0">
            <div ref="knownRowRef" class="overflow-x-auto overflow-y-hidden overscroll-x-contain hide-scrollbar" :style="knownBleedStyle">
              <div class="flex w-max gap-3 p-px">
                <CuiFaceCard
                  v-for="face in faceStore.knownFaces.value"
                  :key="face.name"
                  class="shrink-0 h-auto!"
                  :style="{ width: `${KNOWN_CARD_WIDTH}px` }"
                  variant="known"
                  :thumbnail="thumbnailToUrl(face.thumbnail)"
                  :name="face.name"
                  :image-count="face.imageCount"
                  :marks="face.marks"
                  @click="!knownSwiping && openKnownFaceDetail(face)"
                />
              </div>
            </div>

            <div v-if="!knownAtStart && knownBleedLeft > 0" class="absolute pointer-events-none z-1" :style="knownFadeStyle" />

            <Transition name="fade-2">
              <Button
                v-if="!knownAtStart"
                rounded
                severity="secondary"
                class="absolute left-1 top-1/2 -translate-y-1/2 cui-icon-md shadow-md z-2 opacity-70 hover:opacity-100 transition-opacity"
                @click="scrollKnownToStart"
              >
                <template #icon>
                  <i-tabler:chevron-left width="100%" height="100%" />
                </template>
              </Button>
            </Transition>
          </div>

          <div v-else class="text-muted text-sm">{{ $t('views.faces.no_known_faces') }}</div>
        </section>

        <section class="p-px">
          <div class="flex items-center justify-between mb-3">
            <span class="flex items-center gap-2">
              <span class="card-title m-0!">{{ $t('views.faces.unknown_faces') }}</span>
              <Badge size="small" class="rounded-full px-1.5" :value="String(faceStore.unknownFaces.value.length)" />
            </span>
          </div>

          <div class="flex flex-col gap-3">
            <Card v-if="clustered.clusters.length" class="cui-card border-color-inner h-auto!" :pt="{ body: { class: 'pb-0' } }">
              <template #content>
                <Accordion multiple @update:value="rememberOpened">
                  <AccordionPanel
                    v-for="({ cluster, marks }, i) in clusterPanels"
                    :key="cluster.clusterId"
                    :value="cluster.clusterId"
                    :class="{
                      'border-b-0': i === clustered.clusters.length - 1,
                    }"
                  >
                    <AccordionHeader
                      :class="{
                        'px-0 pt-0': i === 0,
                        'px-0': i !== 0,
                        'pb-5': i === clustered.clusters.length - 1,
                      }"
                    >
                      <span class="flex items-center gap-3 w-full">
                        <div v-if="selectionMode" class="shrink-0" @click.stop="toggleGroupSelection(cluster.faces)">
                          <div
                            class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer"
                            :class="groupSelectionState(cluster.faces) === 'none' ? 'border-surface-400 dark:border-surface-500' : 'bg-primary border-primary'"
                          >
                            <i-mdi:check v-if="groupSelectionState(cluster.faces) === 'all'" class="w-4 h-4 text-white" />
                            <i-mdi:minus v-else-if="groupSelectionState(cluster.faces) === 'some'" class="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <div class="relative shrink-0">
                          <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800">
                            <img v-if="cluster.bestThumbnail" :src="cluster.bestThumbnail" class="w-full h-full object-cover" />
                          </div>
                          <CuiFaceMarkBadge
                            v-if="marks.count"
                            :text="$t('views.faces.card_marked', { count: marks.count }, marks.count)"
                            :danger="marks.danger"
                            compact
                            class="absolute -top-1 -left-1"
                          />
                        </div>
                        <span class="flex flex-wrap items-center gap-x-2">
                          <span class="font-medium">{{ cluster.faces.length }} {{ $t('views.faces.faces_in_cluster') }}</span>
                          <span v-if="marks.count" class="text-xs" :class="marks.danger ? 'text-red-500' : 'text-amber-500'">
                            {{ $t('views.faces.to_check', { count: marks.count }) }}
                          </span>
                        </span>
                        <span class="ml-auto flex items-center gap-1 mr-2" @click.stop>
                          <Button
                            v-tooltip.top="$t('views.faces.assign_cluster')"
                            severity="secondary"
                            text
                            rounded
                            class="cui-icon-lg"
                            @click="onAssignCluster(cluster, '__new__')"
                          >
                            <template #icon><i-mdi:account-plus class="w-4 h-4" /></template>
                          </Button>
                          <Button v-tooltip.top="$t('views.faces.ignore_cluster')" severity="secondary" text rounded class="cui-icon-lg" @click="ignoreCluster(cluster)">
                            <template #icon><i-mdi:eye-off class="w-4 h-4" /></template>
                          </Button>
                          <Button v-tooltip.top="$t('views.faces.discard')" severity="danger" text rounded class="cui-icon-lg" @click="skipCluster(cluster)">
                            <template #icon><i-mdi:delete width="100%" height="100%" /></template>
                          </Button>
                        </span>
                      </span>
                    </AccordionHeader>
                    <AccordionContent
                      :pt="{
                        content: {
                          class: {
                            'px-0': true,
                            'pb-5': i === clustered.clusters.length - 1,
                          },
                        },
                      }"
                    >
                      <div
                        v-if="openedPanels.has(cluster.clusterId)"
                        class="grid w-full gap-3"
                        :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '120px' : '140px'}, 1fr))` }"
                      >
                        <CuiFaceCard
                          v-for="face in cluster.faces"
                          :key="face.id"
                          variant="unknown"
                          show-remove
                          :thumbnail="thumbnailToUrl(face.thumbnail)"
                          :timestamp="face.timestamp"
                          :confidence="face.confidence"
                          :clarity="face.clarity"
                          :also-filed-under="face.alsoFiledUnder"
                          :selection-mode="selectionMode"
                          :selected="selectedIds.has(face.id)"
                          @click="toggleSelection(face.id)"
                          @assign-prompt="promptAssignSingle(face)"
                          @remove="removeFromCluster(face)"
                          @ignore="ignoreFace(face)"
                          @skip="discardFace(face)"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionPanel>
                </Accordion>
              </template>
            </Card>

            <Card v-if="clustered.ungrouped.length" class="cui-card border-color-inner h-auto!" :pt="{ body: { class: 'pb-0' } }">
              <template #content>
                <Accordion @update:value="rememberOpened">
                  <AccordionPanel value="__ungrouped__" class="border-b-0">
                    <AccordionHeader class="px-0 pt-0 pb-5">
                      <span class="flex items-center gap-3 w-full">
                        <div v-if="selectionMode" class="shrink-0" @click.stop="toggleGroupSelection(clustered.ungrouped)">
                          <div
                            class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer"
                            :class="groupSelectionState(clustered.ungrouped) === 'none' ? 'border-surface-400 dark:border-surface-500' : 'bg-primary border-primary'"
                          >
                            <i-mdi:check v-if="groupSelectionState(clustered.ungrouped) === 'all'" class="w-4 h-4 text-white" />
                            <i-mdi:minus v-else-if="groupSelectionState(clustered.ungrouped) === 'some'" class="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <div class="relative shrink-0">
                          <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                            <i-mdi:account-question class="w-5 h-5 text-muted" />
                          </div>
                          <CuiFaceMarkBadge
                            v-if="ungroupedMarks.count"
                            :text="$t('views.faces.card_marked', { count: ungroupedMarks.count }, ungroupedMarks.count)"
                            :danger="ungroupedMarks.danger"
                            compact
                            class="absolute -top-1 -left-1"
                          />
                        </div>
                        <span class="flex flex-col">
                          <span class="flex items-center gap-2 font-medium">
                            {{ $t('views.faces.ungrouped') }}
                            <Badge size="small" class="rounded-full px-1.5" severity="secondary" :value="String(clustered.ungrouped.length)" />
                            <span v-if="ungroupedMarks.count" class="text-xs font-normal" :class="ungroupedMarks.danger ? 'text-red-500' : 'text-amber-500'">
                              {{ $t('views.faces.to_check', { count: ungroupedMarks.count }) }}
                            </span>
                          </span>
                          <span class="text-muted text-sm font-normal">{{ $t('views.faces.ungrouped_hint') }}</span>
                        </span>
                        <span class="ml-auto flex items-center gap-1 mr-2" @click.stop>
                          <Button v-tooltip.top="$t('views.faces.discard')" severity="danger" text rounded class="cui-icon-lg" @click="clearUngrouped">
                            <template #icon><i-mdi:delete width="100%" height="100%" /></template>
                          </Button>
                        </span>
                      </span>
                    </AccordionHeader>
                    <AccordionContent :pt="{ content: { class: 'px-0 pb-5' } }">
                      <div
                        v-if="openedPanels.has('__ungrouped__')"
                        class="grid w-full gap-3"
                        :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '120px' : '140px'}, 1fr))` }"
                      >
                        <CuiFaceCard
                          v-for="face in clustered.ungrouped"
                          :key="face.id"
                          variant="unknown"
                          :thumbnail="thumbnailToUrl(face.thumbnail)"
                          :timestamp="face.timestamp"
                          :confidence="face.confidence"
                          :clarity="face.clarity"
                          :also-filed-under="face.alsoFiledUnder"
                          :selection-mode="selectionMode"
                          :selected="selectedIds.has(face.id)"
                          @click="toggleSelection(face.id)"
                          @assign-prompt="promptAssignSingle(face)"
                          @ignore="ignoreFace(face)"
                          @skip="discardFace(face)"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionPanel>
                </Accordion>
              </template>
            </Card>

            <Card v-if="faceStore.ignoredFaces.value.length" class="cui-card border-color-inner h-auto!" :pt="{ body: { class: 'pb-0' } }">
              <template #content>
                <Accordion @update:value="rememberOpened">
                  <AccordionPanel value="__ignored__" class="border-b-0">
                    <AccordionHeader class="px-0 pt-0 pb-5">
                      <span class="flex items-center gap-3 w-full">
                        <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800 shrink-0 flex items-center justify-center">
                          <i-mdi:eye-off class="w-5 h-5 text-muted" />
                        </div>
                        <span class="flex flex-col">
                          <span class="flex items-center gap-2 font-medium">
                            {{ $t('views.faces.ignored_faces') }}
                            <Badge size="small" class="rounded-full px-1.5" severity="secondary" :value="String(faceStore.ignoredFaces.value.length)" />
                          </span>
                          <span class="text-muted text-sm font-normal">{{ $t('views.faces.ignored_hint') }}</span>
                        </span>
                      </span>
                    </AccordionHeader>
                    <AccordionContent :pt="{ content: { class: 'px-0 pb-5' } }">
                      <div
                        v-if="openedPanels.has('__ignored__')"
                        class="grid w-full gap-3"
                        :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '120px' : '140px'}, 1fr))` }"
                      >
                        <CuiFaceCard
                          v-for="face in faceStore.ignoredFaces.value"
                          :key="face.id"
                          variant="ignored"
                          :thumbnail="thumbnailToUrl(face.thumbnail)"
                          :timestamp="face.timestamp"
                          :clarity="face.clarity"
                          @restore="restoreFace(face)"
                          @skip="discardIgnoredFace(face)"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionPanel>
                </Accordion>
              </template>
            </Card>
          </div>

          <div v-if="!faceStore.unknownFaces.value.length && !faceStore.ignoredFaces.value.length" class="text-muted text-sm">
            {{ $t('views.faces.no_unknown_faces') }}
          </div>
        </section>
      </template>
    </template>

    <CuiFloatingButtonGroup
      v-if="isAdmin && faceStore.knownFaces.value.length"
      side="left"
      :offset="`calc(${reindexAnchorLeft}px + 0.75rem)`"
      :force-visible="reindexStatus?.running"
      :class="{ 'transition-none!': !layoutReady }"
    >
      <Button
        severity="secondary"
        rounded
        class="shadow-lg m-1"
        :disabled="reindexStatus?.running"
        :label="
          reindexChecking
            ? $t('views.faces.reindex.checking')
            : reindexStatus?.running
              ? $t('views.faces.reindex.progress', { done: reindexStatus.done, total: reindexStatus.total })
              : $t('views.faces.reindex.button')
        "
        @click="openReindexDialog"
      >
        <template #icon>
          <SpinnerIcon v-if="reindexStatus?.running" />
          <ReindexIcon v-else />
        </template>
      </Button>
    </CuiFloatingButtonGroup>

    <CuiFloatingButtonGroup :force-visible="selectionMode">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          v-if="allUnknownFaces.length"
          :tooltip-props="{ value: $t('views.faces.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
        <CuiFloatingButton
          v-if="faceStore.knownFaces.value.length"
          :tooltip-props="{ value: $t('views.faces.rescan_events') }"
          :button-props="{ severity: 'secondary', disabled: rescanning }"
          :icon="rescanning ? SpinnerIcon : RescanIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="rescanFaces"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('views.faces.add_face') }"
          :button-props="{ class: 'text-white' }"
          :icon="PlusIcon"
          :icon-props="{ width: '30px', height: '30px' }"
          @click="openUploadDialog"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: allSelected ? $t('components.form.tooltip.deselect_all') : $t('components.form.tooltip.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('views.faces.assign') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size || bulkBusy }"
          :icon="AssignIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="promptAssignSelected"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('views.faces.remove_from_cluster') }"
          :button-props="{ severity: 'secondary', disabled: !selectedClusteredIds.length || bulkBusy }"
          :icon="RemoveIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkRemoveFromGroup"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('views.faces.ignore') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size || bulkBusy }"
          :icon="IgnoreIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkIgnore"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('views.faces.discard') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size || bulkBusy }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkDiscard"
        />
      </template>
    </CuiFloatingButtonGroup>
  </div>
</template>

<script lang="ts" setup>
import { thumbnailToUrl, useFaceStore, useFacesReindex } from '@camera.ui/nvr';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import AssignIcon from '~icons/mdi/account-plus';
import CloseIcon from '~icons/mdi/close';
import ReindexIcon from '~icons/mdi/database-refresh-outline';
import TrashIcon from '~icons/mdi/delete-outline';
import IgnoreIcon from '~icons/mdi/eye-off';
import RescanIcon from '~icons/mdi/refresh';
import SpinnerIcon from '~icons/svg-spinners/ring-resize';
import SelectIcon from '~icons/tabler/dots-filled';
import RemoveIcon from '~icons/tabler/minus';
import PlusIcon from '~icons/typcn/plus';

import { countUnassignedMarks } from '@/common/faceMarks.js';
import FaceDetailDialog from '@/components/CuiDialog/templates/FaceDetail/FaceDetail.vue';
import FaceNewPersonDialog from '@/components/CuiDialog/templates/FaceNewPerson/FaceNewPerson.vue';
import FacesReindexDialog from '@/components/CuiDialog/templates/FacesReindex/FacesReindex.vue';
import FaceUploadDialog from '@/components/CuiDialog/templates/FaceUpload/FaceUpload.vue';
import { useCardSelection } from '@/composables/useCardSelection.js';

import type { FaceDetailFaceImage } from '@/components/CuiDialog/templates/FaceDetail/types.js';
import type { FaceImageData, FaceProfile, IgnoredFace, UnknownFace } from '@camera.ui/nvr';

const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth } = useSharedWindowSize();
const faceStore = useFaceStore();

const clustered = faceStore.clusteredUnknowns;

const KNOWN_CARD_WIDTH = 160;
const KNOWN_CARD_GAP = 12;

const knownSkeletonRef = useTemplateRef<HTMLElement>('knownSkeletonRef');
const knownContainerRef = useTemplateRef<HTMLElement>('knownContainerRef');
const knownRowRef = useTemplateRef<HTMLElement>('knownRowRef');

const {
  bleedLeft: knownBleedLeft,
  bleedStyle: knownBleedStyle,
  fadeStyle: knownFadeStyle,
  isAtStart: knownAtStart,
  isSwiping: knownSwiping,
  scrollToStart: scrollKnownToStart,
} = useBleedScroll(knownContainerRef, knownRowRef);
const reindexAnchorRef = useTemplateRef<HTMLElement>('reindexAnchorRef');
const { left: reindexAnchorLeft } = useElementBounding(reindexAnchorRef);
const rescanning = ref(false);
const layoutReady = ref(false);
const openedPanels = ref(new Set<string>());

const { status: reindexStatus, checking: reindexChecking } = useFacesReindex();

const allUnknownFaces = computed(() => [...clustered.value.clusters.flatMap((cluster) => cluster.faces), ...clustered.value.ungrouped]);
const clusterPanels = computed(() => clustered.value.clusters.map((cluster) => ({ cluster, marks: countUnassignedMarks(cluster.faces) })));
const ungroupedMarks = computed(() => countUnassignedMarks(clustered.value.ungrouped));

const { selectionMode, selectedIds, selectedItems, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  allUnknownFaces,
  (face) => face.id,
);

const isAdmin = computed(() => hasPermission(undefined, 'admin'));

const selectedClusteredIds = computed(() => {
  const clusteredFaceIds = new Set(clustered.value.clusters.flatMap((cluster) => cluster.faces.map((face) => face.id)));
  return [...selectedIds.value].filter((id) => clusteredFaceIds.has(id));
});

const knownSkeletonCount = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  windowWidth.value; // reactive on resize
  const containerWidth = knownSkeletonRef.value?.clientWidth ?? windowWidth.value;
  return Math.floor((containerWidth + KNOWN_CARD_GAP) / (KNOWN_CARD_WIDTH + KNOWN_CARD_GAP)) || 4;
});

function groupSelectionState(faces: UnknownFace[]): 'none' | 'some' | 'all' {
  let count = 0;
  for (const face of faces) {
    if (selectedIds.value.has(face.id)) count++;
  }
  if (count === 0) return 'none';
  return count === faces.length ? 'all' : 'some';
}

function rememberOpened(value: string | string[] | null | undefined): void {
  if (!value) return;
  for (const panel of Array.isArray(value) ? value : [value]) openedPanels.value.add(panel);
}

function toggleGroupSelection(faces: UnknownFace[]) {
  const next = new Set(selectedIds.value);
  const all = faces.every((face) => next.has(face.id));
  for (const face of faces) {
    if (all) next.delete(face.id);
    else next.add(face.id);
  }
  selectedIds.value = next;
}

async function rescanFaces() {
  rescanning.value = true;
  try {
    const updated = await faceStore.rescanFaces();
    if (updated > 0) {
      toast.add({ severity: 'success', detail: t('views.faces.rescan_complete', { count: updated }), life: 3000 });
    } else {
      toast.add({ severity: 'info', detail: t('views.faces.rescan_no_matches'), life: 3000 });
    }
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    rescanning.value = false;
  }
}

async function openKnownFaceDetail(face: FaceProfile) {
  const images = ref<FaceDetailFaceImage[]>([]);
  const loading = ref(true);

  const dialogRef = dialog.openComponentDialog(FaceDetailDialog, {
    data: {
      title: face.name,
      contentProps: {
        face: computed(() => ({ ...face, images: images.value, imageCount: loading.value ? face.imageCount : images.value.length, loading: loading.value })),
        onRemoveImage: async (idx: number) => {
          const image = images.value[idx];
          if (!image) return;
          try {
            await faceStore.removeFaceImage(face.name, image.id);
            const at = images.value.findIndex((img) => img.id === image.id);
            if (at >= 0) images.value.splice(at, 1);
            applyMarks(images.value, await faceStore.listFaceImageMeta(face.name));
            toast.add({ severity: 'success', detail: t('views.faces.image_removed'), life: 3000 });
            await faceStore.refresh(true);
          } catch (err) {
            toast.add({ severity: 'error', detail: err, life: 3000 });
          }
        },
        onDeletePerson: async () => {
          try {
            await faceStore.deleteFace(face.name);
            toast.add({ severity: 'success', detail: t('views.faces.person_deleted'), life: 3000 });
            dialogRef.close();
            await faceStore.refresh(true);
          } catch (err) {
            toast.add({ severity: 'error', detail: err, life: 3000 });
          }
        },
      },
      confirmText: t('views.faces.delete_person'),
      confirmButtonProps: { severity: 'danger' },
    },
  });

  try {
    const meta = await faceStore.listFaceImageMeta(face.name);
    images.value = meta.map((img) => ({
      id: img.id,
      confidence: img.confidence ?? 0,
      clarity: img.clarity,
      sameAs: img.sameAs,
      alsoFiledUnder: img.alsoFiledUnder,
      unlike: img.unlike,
    }));
  } catch {
    // no images
  } finally {
    loading.value = false;
  }

  try {
    await faceStore.loadFaceImageThumbnails(
      face.name,
      images.value.map((img) => img.id),
      (thumbs) => {
        for (const img of images.value) {
          if (thumbs[img.id]) img.src = thumbnailToUrl(thumbs[img.id]);
        }
      },
    );
  } catch {
    // a tile without its picture stays a placeholder
  }
}

function applyMarks(images: FaceDetailFaceImage[], meta: FaceImageData[]) {
  const fresh = new Map(meta.map((img) => [img.id, img]));
  for (const image of images) {
    const marks = fresh.get(image.id);
    if (!marks) continue;
    image.sameAs = marks.sameAs;
    image.alsoFiledUnder = marks.alsoFiledUnder;
    image.unlike = marks.unlike;
  }
}

function openReindexDialog(): void {
  dialog.openComponentDialog(FacesReindexDialog, {
    data: {
      title: t('views.faces.reindex.title'),
      contentProps: {},
      confirmText: t('views.faces.reindex.start'),
    },
  });
}

function openUploadDialog() {
  dialog.openComponentDialog(FaceUploadDialog, {
    data: {
      title: t('views.faces.add_face'),
      confirmText: t('views.faces.enroll'),
      contentProps: {
        onEnroll: async (name: string, imageData: Uint8Array) => {
          await faceStore.enrollFace(name, imageData);
          toast.add({ severity: 'success', detail: t('views.faces.face_enrolled'), life: 3000 });
          await faceStore.refresh(true);
        },
      },
    },
  });
}

async function onAssignCluster(cluster: { faces: UnknownFace[] }, value: string) {
  const faceIds = cluster.faces.map((f) => f.id);
  if (value === '__new__') {
    promptNewPersonForCluster(cluster.faces);
    return;
  }
  try {
    await faceStore.enrollCluster(value, faceIds);
    toast.add({ severity: 'success', detail: t('views.faces.face_assigned'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

function promptNewPersonForCluster(faces: UnknownFace[]) {
  const faceIds = faces.map((f) => f.id);
  dialog.openComponentDialog(FaceNewPersonDialog, {
    data: {
      title: t('views.faces.enter_person_name'),
      confirmText: t('views.faces.enroll'),
      contentProps: { knownNames: faceStore.knownFaces.value.map((f) => f.name), faces },
    },
    onConfirm: async (name: string) => {
      try {
        await faceStore.enrollCluster(name, faceIds);
        toast.add({ severity: 'success', detail: t('views.faces.face_enrolled'), life: 3000 });
      } catch (err) {
        toast.add({ severity: 'error', detail: err, life: 3000 });
      }
    },
  });
}

async function skipCluster(cluster: { clusterId: string }) {
  try {
    await faceStore.deleteUnknownFacesByCluster(cluster.clusterId);
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

async function discardFace(face: UnknownFace) {
  try {
    await faceStore.deleteUnknownFace(face.id);
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

async function removeFromCluster(face: UnknownFace) {
  try {
    await faceStore.removeFromCluster(face.id);
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

async function ignoreFace(face: UnknownFace) {
  try {
    await faceStore.ignoreFaces([face.id]);
    toast.add({ severity: 'success', detail: t('views.faces.face_ignored'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

async function ignoreCluster(cluster: { clusterId: string }) {
  try {
    await faceStore.ignoreCluster(cluster.clusterId);
    toast.add({ severity: 'success', detail: t('views.faces.face_ignored'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

async function bulkIgnore() {
  const ids = selectedItems.value.map((face) => face.id);
  if (!ids.length) return;

  bulkBusy.value = true;
  try {
    await faceStore.ignoreFaces(ids);
    toast.add({ severity: 'success', detail: t('views.faces.face_ignored'), life: 3000 });
    exitSelectionMode();
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    bulkBusy.value = false;
  }
}

async function discardIgnoredFace(face: IgnoredFace) {
  try {
    await faceStore.deleteIgnoredFaces([face.id]);
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

async function restoreFace(face: IgnoredFace) {
  try {
    await faceStore.unignoreFaces([face.id]);
    toast.add({ severity: 'success', detail: t('views.faces.face_restored'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

function promptAssignSingle(face: UnknownFace) {
  dialog.openComponentDialog(FaceNewPersonDialog, {
    data: {
      title: t('views.faces.assign'),
      confirmText: t('views.faces.enroll'),
      contentProps: { knownNames: faceStore.knownFaces.value.map((f) => f.name), faces: [face] },
    },
    onConfirm: async (name: string) => {
      try {
        await faceStore.enrollFromEvent(name, face.id);
        toast.add({ severity: 'success', detail: t('views.faces.face_assigned'), life: 3000 });
        await faceStore.refresh(true);
      } catch (err) {
        toast.add({ severity: 'error', detail: err, life: 3000 });
      }
    },
  });
}

function promptAssignSelected() {
  const faces = selectedItems.value;
  const faceIds = faces.map((face) => face.id);
  if (!faceIds.length) return;

  dialog.openComponentDialog(FaceNewPersonDialog, {
    data: {
      title: t('views.faces.assign'),
      confirmText: t('views.faces.enroll'),
      contentProps: { knownNames: faceStore.knownFaces.value.map((f) => f.name), faces },
    },
    onConfirm: async (name: string) => {
      bulkBusy.value = true;
      try {
        await faceStore.enrollCluster(name, faceIds);
        toast.add({ severity: 'success', detail: t('views.faces.face_assigned'), life: 3000 });
        exitSelectionMode();
      } catch (err) {
        toast.add({ severity: 'error', detail: err, life: 3000 });
      } finally {
        bulkBusy.value = false;
      }
    },
  });
}

async function bulkRemoveFromGroup() {
  const ids = selectedClusteredIds.value;
  if (!ids.length) return;

  bulkBusy.value = true;
  try {
    await faceStore.removeFacesFromCluster(ids);
    exitSelectionMode();
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    bulkBusy.value = false;
  }
}

async function bulkDiscard() {
  const ids = selectedItems.value.map((face) => face.id);
  if (!ids.length) return;

  bulkBusy.value = true;
  try {
    await faceStore.deleteUnknownFaces(ids);
    exitSelectionMode();
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    bulkBusy.value = false;
  }
}

async function clearUngrouped() {
  try {
    await faceStore.deleteUngroupedUnknownFaces();
    toast.add({ severity: 'success', detail: t('views.faces.all_unknown_cleared'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

onMounted(() => {
  requestAnimationFrame(() => {
    layoutReady.value = true;
  });
});
</script>

<style scoped></style>
