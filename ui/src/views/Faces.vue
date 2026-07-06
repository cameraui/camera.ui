<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t('views.faces.title') }}
    </h1>

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
        <div class="grid w-full gap-3 p-px" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '140px' : '160px'}, 1fr))` }">
          <div v-for="i in knownSkeletonCount" :key="i" class="cui-card overflow-hidden">
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
      <div
        v-if="!faceStore.knownFaces.value.length && !faceStore.unknownFaces.value.length"
        class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4"
      >
        <i-mdi:face-recognition class="w-12 h-12 text-muted" />
        <span class="text-muted text-sm">{{ $t('views.faces.no_faces_yet') }}</span>
      </div>

      <template v-else>
        <section class="mb-6 p-px">
          <div class="flex items-center justify-between mb-3">
            <span class="card-title m-0!">{{ $t('views.faces.known_faces') }} ({{ faceStore.knownFaces.value.length }})</span>
            <Button
              v-if="faceStore.knownFaces.value.length"
              v-tooltip.top="$t('views.faces.rescan_events')"
              severity="secondary"
              text
              rounded
              class="cui-icon-lg"
              :loading="rescanning"
              @click="rescanFaces"
            >
              <template #icon><i-mdi:refresh class="w-4 h-4" /></template>
            </Button>
          </div>

          <div
            v-if="faceStore.knownFaces.value.length"
            class="grid w-full gap-3 p-px"
            :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '140px' : '160px'}, 1fr))` }"
          >
            <CuiFaceCard
              v-for="face in faceStore.knownFaces.value"
              :key="face.name"
              variant="known"
              :thumbnail="thumbnailToUrl(face.thumbnail)"
              :name="face.name"
              :image-count="face.imageCount"
              @click="openKnownFaceDetail(face)"
            />
          </div>

          <div v-else class="text-muted text-sm">{{ $t('views.faces.no_known_faces') }}</div>
        </section>

        <section class="mb-6 p-px">
          <div class="flex items-center justify-between mb-3">
            <span class="card-title m-0!">{{ $t('views.faces.unknown_faces') }} ({{ faceStore.unknownFaces.value.length }})</span>
          </div>

          <Card v-if="faceStore.unknownFaces.value.length || clustered.ungrouped.length" class="cui-card border-color-inner h-auto!" :pt="{ body: { class: 'pb-0' } }">
            <template #content>
              <Accordion v-if="faceStore.unknownFaces.value.length" multiple>
                <AccordionPanel
                  v-for="(cluster, i) in clustered.clusters"
                  :key="cluster.clusterId"
                  :value="cluster.clusterId"
                  :class="{
                    'border-b-0': clustered.ungrouped.length === 0 && i === clustered.clusters.length - 1,
                  }"
                >
                  <AccordionHeader
                    :class="{
                      'px-0 pt-0': i === 0,
                      'px-0': i !== 0,
                      'pb-5': clustered.ungrouped.length === 0 && i === clustered.clusters.length - 1,
                    }"
                  >
                    <span class="flex items-center gap-3 w-full">
                      <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800 shrink-0">
                        <img v-if="cluster.bestThumbnail" :src="cluster.bestThumbnail" class="w-full h-full object-cover" />
                      </div>
                      <span class="font-medium">{{ cluster.faces.length }} {{ $t('views.faces.faces_in_cluster') }}</span>
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
                          'pb-5': clustered.ungrouped.length === 0 && i === clustered.clusters.length - 1,
                        },
                      },
                    }"
                  >
                    <div class="grid w-full gap-3" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '120px' : '140px'}, 1fr))` }">
                      <CuiFaceCard
                        v-for="face in cluster.faces"
                        :key="face.id"
                        variant="unknown"
                        show-remove
                        :thumbnail="thumbnailToUrl(face.thumbnail)"
                        :timestamp="face.timestamp"
                        :confidence="face.confidence"
                        @assign-prompt="promptAssignSingle(face)"
                        @remove="removeFromCluster(face)"
                        @skip="discardFace(face)"
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel
                  v-if="clustered.ungrouped.length"
                  value="__ungrouped__"
                  :class="{
                    'border-b-0': true,
                  }"
                >
                  <AccordionHeader
                    :class="{
                      'px-0 pt-0': clustered.clusters.length === 0,
                      'px-0': clustered.clusters.length !== 0,
                      'pb-5': true,
                    }"
                  >
                    <span class="flex items-center gap-3 w-full">
                      <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800 shrink-0 flex items-center justify-center">
                        <i-mdi:account-question class="w-5 h-5 text-muted" />
                      </div>
                      <span class="font-medium">{{ clustered.ungrouped.length }} {{ $t('views.faces.ungrouped') }}</span>
                      <span class="ml-auto flex items-center gap-1 mr-2" @click.stop>
                        <Button v-tooltip.top="$t('views.faces.discard')" severity="danger" text rounded class="cui-icon-lg" @click="clearUngrouped">
                          <template #icon><i-mdi:delete width="100%" height="100%" /></template>
                        </Button>
                      </span>
                    </span>
                  </AccordionHeader>
                  <AccordionContent
                    :pt="{
                      content: {
                        class: {
                          'px-0 pb-0': true,
                          'mb-5': true,
                        },
                      },
                    }"
                  >
                    <div class="grid w-full gap-3" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '120px' : '140px'}, 1fr))` }">
                      <CuiFaceCard
                        v-for="face in clustered.ungrouped"
                        :key="face.id"
                        variant="unknown"
                        :thumbnail="thumbnailToUrl(face.thumbnail)"
                        :timestamp="face.timestamp"
                        :confidence="face.confidence"
                        @assign-prompt="promptAssignSingle(face)"
                        @skip="discardFace(face)"
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>
              </Accordion>
            </template>
          </Card>

          <div v-else class="text-muted text-sm">{{ $t('views.faces.no_unknown_faces') }}</div>
        </section>
      </template>
    </template>

    <CuiFloatingButton
      :tooltip-props="{ value: $t('views.faces.add_face') }"
      :button-props="{ class: 'text-white' }"
      :icon="PlusIcon"
      :icon-props="{ width: '30px', height: '30px' }"
      @click="openUploadDialog"
    />
  </div>
</template>

<script lang="ts" setup>
import { thumbnailToUrl, useFaceStore } from '@camera.ui/nvr';
import PlusIcon from '~icons/typcn/plus';

import FaceDetailDialog from '@/components/CuiDialog/templates/FaceDetail/FaceDetail.vue';
import FaceNewPersonDialog from '@/components/CuiDialog/templates/FaceNewPerson/FaceNewPerson.vue';
import FaceUploadDialog from '@/components/CuiDialog/templates/FaceUpload/FaceUpload.vue';

import type { FaceProfile, UnknownFace } from '@camera.ui/nvr';

const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth } = useSharedWindowSize();
const faceStore = useFaceStore();

const clustered = faceStore.clusteredUnknowns;

const knownSkeletonRef = useTemplateRef<HTMLElement>('knownSkeletonRef');
const rescanning = ref(false);

const knownSkeletonCount = computed(() => {
  void windowWidth.value; // reactive on resize
  const minSize = smBreakpoint.value ? 140 : 160;
  const gap = 12; // gap-3
  const containerWidth = knownSkeletonRef.value?.clientWidth ?? windowWidth.value;
  return Math.floor((containerWidth + gap) / (minSize + gap)) || 4;
});

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
  const images = ref<{ id: string; src: string; confidence: number }[]>([]);
  try {
    const raw = await faceStore.getFaceImages(face.name);
    images.value = raw
      .map((img) => {
        const src = thumbnailToUrl(img.jpeg);
        return src ? { id: img.id, src, confidence: img.confidence ?? 0 } : null;
      })
      .filter(Boolean) as { id: string; src: string; confidence: number }[];
  } catch {
    // No images available
  }

  const dialogRef = dialog.openComponentDialog(FaceDetailDialog, {
    data: {
      title: face.name,
      contentProps: {
        face: computed(() => ({ ...face, images: images.value, imageCount: images.value.length })),
        onRemoveImage: async (idx: number) => {
          const image = images.value[idx];
          if (!image) return;
          try {
            await faceStore.removeFaceImage(face.name, image.id);
            images.value.splice(idx, 1);
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
}

function openUploadDialog() {
  dialog.openComponentDialog(FaceUploadDialog, {
    data: {
      title: t('views.faces.add_face'),
      confirmText: t('views.faces.enroll'),
      contentProps: {
        onEnroll: async (name: string, imageData: Uint8Array, facePluginName: string) => {
          await faceStore.enrollFace(name, imageData, facePluginName);
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
    promptNewPersonForCluster(faceIds);
    return;
  }
  try {
    await faceStore.enrollCluster(value, faceIds);
    toast.add({ severity: 'success', detail: t('views.faces.face_assigned'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

function promptNewPersonForCluster(faceIds: string[]) {
  dialog.openComponentDialog(FaceNewPersonDialog, {
    data: {
      title: t('views.faces.enter_person_name'),
      confirmText: t('views.faces.enroll'),
      contentProps: { knownNames: faceStore.knownFaces.value.map((f) => f.name) },
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

function promptAssignSingle(face: UnknownFace) {
  dialog.openComponentDialog(FaceNewPersonDialog, {
    data: {
      title: t('views.faces.assign'),
      confirmText: t('views.faces.enroll'),
      contentProps: { knownNames: faceStore.knownFaces.value.map((f) => f.name) },
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

async function clearUngrouped() {
  try {
    await faceStore.deleteUngroupedUnknownFaces();
    toast.add({ severity: 'success', detail: t('views.faces.all_unknown_cleared'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}
</script>

<style scoped></style>
