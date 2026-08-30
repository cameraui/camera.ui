<template>
  <div v-if="problem" class="flex items-center gap-2 p-4 text-sm text-red-500">
    <i-mdi:alert-circle-outline class="h-5 w-5 shrink-0" />
    <span>{{ problem }}</span>
  </div>
  <div v-else class="relative h-full w-full overflow-auto">
    <CuiCameraViewDnD
      v-if="view"
      ref="viewDndRef"
      :key="view._id"
      :cameras="cameras?.result ?? []"
      :rearrange-mode="rearrangeMode"
      :view-size="view.viewSize"
      :title="view.name"
      :cards="cards"
      :camera-card-props="cameraCardProps"
      :camera-card-models="cameraCardModels"
      @expand="onExpand"
      @rearrange="onRearrange"
    />
    <Button
      v-if="view && props.config.rearrange !== false"
      v-tooltip.left="{ value: rearrangeMode ? $t('views.camview.rearrange_done') : $t('views.camview.rearrange') }"
      severity="secondary"
      rounded
      class="dark-mode cui-icon-md absolute right-2 top-2 z-10"
      :class="{ 'bg-primary! text-white!': rearrangeMode }"
      @click="rearrangeMode = !rearrangeMode"
    >
      <template #icon>
        <i-mdi:check v-if="rearrangeMode" width="100%" height="100%" />
        <i-mdi:cursor-move v-else width="100%" height="100%" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';
import { UsersQuery } from '@/api/routes/users.js';
import CuiCameraViewDnD from '@/components/CuiCameraViewDnD/CuiCameraViewDnD.vue';

import type { CuiCameraCardModels, CuiCameraCardProps } from '@/components/CuiCameraCard/types.js';
import type { CardState } from '@/components/CuiCameraViewDnD/types.js';
import type { DBCamera, DBCamviewLayoutCamera } from '@shared/types';
import type { HaViewCardConfig, HomeAssistant } from './types.js';

const props = defineProps<{
  hass: HomeAssistant;
  config: HaViewCardConfig;
  entryId: string;
  fill?: boolean;
}>();

const usersQuery = new UsersQuery();
const camerasQuery = new CamerasQuery();
const { user } = storeToRefs(useAuthStore());
const { uiSettings } = storeToRefs(useUiStore());
const { smBreakpoint } = useSharedCuiBreakpoint();

const { data: cameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: views, isLoading: viewsLoading } = usersQuery.getViewsQuery(
  computed(() => user.value?.username ?? ''),
  { page: 1, pageSize: -1 },
);

const viewDndRef = useTemplateRef<InstanceType<typeof CuiCameraViewDnD>>('viewDndRef');
const rearrangeMode = ref(false);
const cards = ref<CardState[]>([]);

const cameraCardModels = reactive<CuiCameraCardModels>({
  sourceRole: 'low-resolution',
  activityMode: 'always-on',
  streamingMode: 'webrtc',
});

const view = computed(() => {
  const list = views.value?.result ?? [];
  const wanted = props.config.view;
  return wanted ? list.find((v) => v._id === wanted || v.name === wanted) : undefined;
});

const problem = computed(() => {
  if (viewsLoading.value) return '';
  if (!views.value?.result.length) return 'No camera.ui views yet, create one in camera.ui under Camview';
  if (!props.config.view) return 'Select a camera.ui view in the card settings';
  if (!view.value) return `View not found: ${props.config.view}`;
  return '';
});

const cameraCardProps = computed<Omit<CuiCameraCardProps, 'cameraInfo'>>(() => ({
  doubleClickZoom: false,
  flatCard: true,
  cardFit: view.value?.cardFit ?? 'aspect',
  cameraNameOverlay: true,
  control: true,
  toolbar: false,
  expandableCard: (view.value?.cameras?.length ?? 0) > 1,
  detectionIndicatorOverlay: !rearrangeMode.value,
  boundingBoxOverlay: false,
  cardClickAction: 'expand',
  viewTransition: false,
  cardProps: { pt: { root: { style: 'background: #000' } } },
}));

function layoutKey(viewId: string): string {
  return `${smBreakpoint.value ? 'mobile' : 'desktop'}:${viewId}`;
}

function onRearrange(layout: DBCamviewLayoutCamera[]): void {
  const viewId = view.value?._id;
  if (!viewId) return;
  uiSettings.value.camview.layouts ??= {};
  uiSettings.value.camview.layouts[layoutKey(viewId)] = layout.map((c) => ({
    index: c.index,
    cameraId: c.cameraId,
    x: c.x ?? 0,
    y: c.y ?? 0,
    w: c.colSpan ?? 1,
    h: c.rowSpan ?? 1,
  }));
}

function onExpand(_camera: DBCamera, _expanded: boolean): void {}

watch(
  [view, cameras, uiSettings, smBreakpoint],
  () => {
    const current = view.value;
    const cardsArray: CardState[] = Array.from({ length: current?.viewSize ?? 1 }).map((_, index) => ({
      accept: 'camera',
      index,
      lastDroppedCamera: undefined,
    }));
    if (current) {
      const overrides = uiSettings.value.camview.layouts?.[layoutKey(current._id)];
      const available = new Set(cameras.value?.result.map((c) => c._id) ?? []);
      for (const item of current.cameras ?? []) {
        const card = cardsArray[item.index];
        if (!card) continue;
        card.lastDroppedCamera = cameras.value?.result.find((c) => c._id === item.cameraId);
        const override = overrides?.find((o) => o.index === item.index);
        if (override && (!override.cameraId || available.has(override.cameraId))) {
          card.x = override.x;
          card.y = override.y;
          card.colSpan = override.w;
          card.rowSpan = override.h;
        }
      }
    }
    cards.value = cardsArray;
  },
  { deep: true, immediate: true },
);
</script>
