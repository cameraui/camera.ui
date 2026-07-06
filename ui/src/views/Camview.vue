<template>
  <div class="h-full w-full dark-mode relative">
    <CuiTopNavbar :left-offset="navbarOffset" animate>
      <template #left>
        <CuiTopNavbarItem
          v-if="!newView && currentView"
          type="dropdown"
          :label="currentView.name"
          :menu-open="menuRef?.isOpen"
          :disabled="isLoading || editView"
          @click="(e) => menuRef?.toggleMenu(e)"
        />

        <CuiTopNavbarItem v-else-if="newView && viewForm.name" :label="viewForm.name" :disabled="isLoading" />
      </template>

      <template #right>
        <CuiTopNavbarItem
          v-if="!editMode && currentView"
          v-tooltip.bottom="{ value: rearrangeMode ? $t('views.camview.rearrange_done') : $t('views.camview.rearrange') }"
          :active="rearrangeMode"
          @click="rearrangeMode = !rearrangeMode"
        >
          <template #icon>
            <i-mdi:cursor-move v-if="!rearrangeMode" width="100%" height="100%" />
            <i-mdi:check v-else width="100%" height="100%" />
          </template>
        </CuiTopNavbarItem>

        <CuiTopNavbarItem
          v-if="!editMode && currentView && rearrangeMode && !smBreakpoint"
          v-tooltip.bottom="{ value: $t('views.camview.rearrange_fit_aspect') }"
          @click="viewDndRef?.fitAspectRatios()"
        >
          <template #icon>
            <i-mingcute:grid-2-fill width="100%" height="100%" />
          </template>
        </CuiTopNavbarItem>

        <CuiTopNavbarItem
          v-if="!editMode && currentView && rearrangeMode && !smBreakpoint"
          v-tooltip.bottom="{ value: $t('views.camview.rearrange_auto') }"
          @click="viewDndRef?.compactGrid()"
        >
          <template #icon>
            <i-mdi:auto-fix width="100%" height="100%" />
          </template>
        </CuiTopNavbarItem>

        <CuiTopNavbarItem
          v-if="!editMode && currentView"
          v-tooltip.bottom="{ value: timelineState ? $t('components.form.tooltip.hide_timeline') : $t('components.form.tooltip.show_timeline') }"
          :active="timelineState"
          @click="timelineState = !timelineState"
        >
          <template #icon>
            <i-mingcute:timeline-line v-if="!timelineState" width="100%" height="100%" />
            <i-mingcute:timeline-fill v-else width="100%" height="100%" />
          </template>
        </CuiTopNavbarItem>

        <Divider v-if="!editMode && currentView" layout="vertical" />

        <CuiTopNavbarItem
          v-if="!editMode && currentView"
          :disabled="rearrangeMode"
          v-tooltip.bottom="{ value: $t('components.form.tooltip.delete') }"
          @click="openDialog('removeView')"
        >
          <template #icon>
            <i-mdi:delete width="100%" height="100%" />
          </template>
        </CuiTopNavbarItem>

        <CuiTopNavbarItem
          v-if="!editView && !newView && currentView"
          :disabled="rearrangeMode"
          v-tooltip.bottom="{ value: $t('components.form.tooltip.edit') }"
          @click="editView = true"
        >
          <template #icon>
            <i-mdi:pencil width="100%" height="100%" />
          </template>
        </CuiTopNavbarItem>

        <CuiTopNavbarItem
          v-if="!editView && !newView"
          :disabled="rearrangeMode"
          v-tooltip.bottom="{ value: $t('components.form.tooltip.new') }"
          @click="newViewMenuRef?.toggleMenu"
        >
          <template #icon>
            <i-mdi:plus
              class="transform transition-transform duration-300"
              :class="{
                'rotate-45': newViewMenuRef?.isOpen,
              }"
              width="100%"
              height="100%"
            />
          </template>
        </CuiTopNavbarItem>

        <CuiTopNavbarItem v-if="editView || newView" :label="$t('components.form.button.cancel')" @click="editView ? (editView = false) : (newView = false)" />

        <CuiTopNavbarItem
          v-if="editView || newView"
          :label="$t('components.form.button.save')"
          :disabled="cards.every((c) => c.lastDroppedCamera === undefined)"
          primary
          @click="changeOrAddView"
        />
      </template>
    </CuiTopNavbar>

    <div
      class="w-full h-full flex relative"
      :class="{ 'flex-row': lgBreakpoint, 'flex-col': !lgBreakpoint }"
      :style="{
        paddingTop: `${TOPNAVBAR_HEIGHT}px`,
      }"
    >
      <div
        class="flex relative z-1 camview-content-transition"
        :class="{
          'h-full items-center justify-center': lgBreakpoint || !views?.result.length,
          'w-full items-start justify-start': !lgBreakpoint && views?.result.length,
        }"
        :style="contentContainerStyle"
      >
        <div v-if="isLoading" class="flex flex-col w-full h-full items-center justify-center">
          <ProgressSpinner v-if="true" class="w-[30px] h-[30px] m-0" stroke-width="5" />
        </div>

        <div v-else-if="!currentView && !newView" class="flex flex-col w-full h-full">
          <div class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
            <i-mingcute:grid-fill class="w-12 h-12 text-muted" />
            <span class="text-muted text-sm">{{ $t('views.camview.no_views_configured') }}</span>
          </div>
        </div>

        <div v-else-if="currentView || newView" class="w-full h-full" :class="{ 'p-2 pb-0': !smBreakpoint }">
          <CuiCameraViewDnD
            ref="viewDndRef"
            :key="uiSettings.camview.viewid + (newView ? '-new' : editView ? '-edit' : '-view')"
            :cameras="cameras?.result || []"
            :edit-mode="newView || editView"
            :rearrange-mode="rearrangeMode"
            :view-size="newView ? viewForm.viewSize : viewSize"
            :title="viewForm.name"
            :cards
            :camera-card-props
            :camera-card-models
            @drop="dropCamera"
            @remove="removeCamera"
            @change-view-size="openDialog('editView')"
            @expand="expandCamera"
            @rearrange="rearrangeCamera"
          />
        </div>
      </div>

      <Transition
        :name="lgBreakpoint ? 'slide-left' : 'slide-up'"
        @before-enter="timelineSpaceOccupied = true"
        @after-enter="timelineAnimating = false"
        @before-leave="timelineSpaceOccupied = false"
      >
        <CuiTimeline
          v-if="timelineState"
          :camera-ids="viewCameraIds"
          :initial-timestamp="timelineInitialTimestamp"
          :loading="timelineAnimating"
          :type="lgBreakpoint ? 'vertical' : 'horizontal'"
          dark-mode
          :md-breakpoint="mdBreakpoint"
          class="shrink-0 transition-[left] duration-200"
          :class="{
            'h-full w-[400px] pt-2 pr-2': lgBreakpoint,
            'h-[200px] pt-2 px-2 pb-2 pb-safe-offset fixed right-safe-offset-0 z-10': !lgBreakpoint,
            'p-0! pt-2! border-color': smBreakpoint,
          }"
          :card-class="{
            '!shadow-xl': true,
            '!rounded-none border-l-0! border-r-0!': smBreakpoint,
          }"
          :style="!lgBreakpoint ? { left: `${navbarOffset}px`, bottom: `calc(${bottombarHeight}px + env(safe-area-inset-bottom, 0px))` } : undefined"
          :locale-settings="timelineLocaleSettings"
        />
      </Transition>
    </div>

    <SpeedDial
      v-if="!editMode && currentView"
      :model="cameraButtons"
      direction="up"
      :transition-delay="80"
      :tooltip-options="{ position: 'left', event: undefined }"
      class="absolute right-2 z-11 dark-mode"
      :pt="{ root: { style: 'pointer-events: none' } }"
      :style="{
        bottom: !lgBreakpoint ? `calc(${timelineSpaceOccupied ? 192 : 0}px + ${bottombarHeight > 0 ? `0.5rem` : '0px'})` : '0',
        right: !lgBreakpoint ? '0.5rem' : `calc(${timelineSpaceOccupied ? 400 : 0}px + 0.5rem)`,
        transition: 'bottom 0.25s ease-out, right 0.25s ease-out',
      }"
    >
      <template #button="{ visible, toggleCallback }">
        <Button
          severity="secondary"
          class="dark-mode opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100 transition pointer-events-auto"
          :class="{
            'opacity-100': visible,
          }"
          rounded
          :loading="isLoading"
          @click="toggleCallback"
        >
          <template #icon>
            <div class="relative w-6 h-6">
              <div
                class="bg-white absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{
                  'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': visible,
                }"
              />
              <div
                class="bg-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
                :class="{
                  'opacity-0 scale-0': visible,
                }"
              />
              <div
                class="bg-white absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{
                  'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': visible,
                }"
              />
            </div>
          </template>
        </Button>
      </template>
      <template #item="{ item, toggleCallback }">
        <Button v-tooltip="{ value: item.label }" :loading="isLoading" severity="secondary" v-bind="item.buttonProps" rounded @click="toggleCallback">
          <template #icon>
            <component :is="item.icon" />
          </template>
        </Button>
      </template>
    </SpeedDial>

    <CuiMenu
      ref="menuRef"
      :items
      class="dark-mode"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />

    <CuiMenu
      ref="newViewMenuRef"
      :items="addViewItems"
      class="dark-mode"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { CuiTimeline, useMultiNvrPlayback } from '@camera.ui/nvr';
import { usePrimeVue } from 'primevue';
import StreamingModeMseIcon from '~icons/cbi/iosfacetime';
import ActivityModeActivityIcon from '~icons/fluent/pulse-24-filled';
import SpeakerOnIcon from '~icons/heroicons/speaker-wave-16-solid';
import SpeakerOffIcon from '~icons/heroicons/speaker-x-mark-16-solid';
import ActivityModeSleepIcon from '~icons/icon-park-solid/sleep';
import MicrophoneIcon from '~icons/mage/microphone-fill';
import StreamingModeAutoIcon from '~icons/material-symbols/motion-photos-auto-outline-rounded';
import NewViewIcon from '~icons/mdi/card-plus-outline';
import ActivityModeWebcamIcom from '~icons/mdi/webcam';
import FullscreenOffIcon from '~icons/mingcute/fullscreen-exit-fill';
import FullscreenOnIcon from '~icons/mingcute/fullscreen-fill';
import SourceRoleHighIcon from '~icons/mynaui/letter-h-square-solid';
import SourceRoleLowIcon from '~icons/mynaui/letter-l-square-solid';
import SourceRoleMidIcon from '~icons/mynaui/letter-m-square-solid';
import StreamingModeWebrtcIcon from '~icons/simple-icons/webrtc';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { UsersQuery } from '@/api/routes/users.js';
import { deepToRaw } from '@/common/utils.js';
import CuiCameraViewDnD from '@/components/CuiCameraViewDnD/CuiCameraViewDnD.vue';
import AudioVisualizerDialog from '@/components/CuiDialog/templates/AudioVisualizer/AudioVisualizer.vue';
import CamviewFormDialog from '@/components/CuiDialog/templates/CamviewForm/CamviewForm.vue';
import { TOPNAVBAR_HEIGHT } from '@/components/CuiTopNavbar/types.js';

import type { CuiCameraCardModels, CuiCameraCardProps } from '@/components/CuiCameraCard/types.js';
import type { CardState } from '@/components/CuiCameraViewDnD/types.js';
import type { CamviewFormProps } from '@/components/CuiDialog/templates/CamviewForm/types.js';
import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { CuiTimelineLocale } from '@camera.ui/nvr';
import type { StreamingRole } from '@camera.ui/sdk';
import type { DBCamera, DBCamviewLayout, DBCamviewLayoutCamera, DBCamviewViewSize } from '@shared/types';
import type { ButtonProps } from 'primevue';
import type { HTMLAttributes } from 'vue';

const usersQuery = new UsersQuery();
const camerasQuery = new CamerasQuery();

const props = withDefaults(
  defineProps<{
    navbarWidth?: number;
    navbarLeft?: number;
  }>(),
  {
    navbarWidth: 0,
    navbarLeft: 0,
  },
);

const i18n = useI18n();
const { t } = i18n;
const primevue = usePrimeVue();
const dialog = useCuiDialog();
const { bottombarHeight } = useSharedCuiStates();
const { smBreakpoint, lgBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: cameras, isLoading: camerasLoading } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: views, isLoading: viewsLoading } = usersQuery.getViewsQuery(user.value?.username ?? '', { page: 1, pageSize: -1 });
const { mutate: deleteView, isPending: removeViewPending } = usersQuery.removeViewQuery();
const { mutateAsync: addView, isPending: addViewPending } = usersQuery.createViewQuery();
const { mutateAsync: patchView, isPending: patchViewPending } = usersQuery.patchViewQuery();

const { navbarWidth, navbarLeft } = toRefs(props);
const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');
const newViewMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('newViewMenuRef');
const viewDndRef = useTemplateRef<InstanceType<typeof CuiCameraViewDnD>>('viewDndRef');
const viewForm = ref<DBCamviewLayout>({} as DBCamviewLayout);
const editView = ref(false);
const newView = ref(false);
const rearrangeMode = ref(false);
const timelineState = ref(false);
const timelineSpaceOccupied = ref(false);
const timelineAnimating = ref(false);
const isMuted = ref(true);
const activityMode = ref<CameraActivityMode>('always-on');
const sourceRole = ref<StreamingRole>('low-resolution');
const streamingMode = ref<VideoStreamingMode>('webrtc');
const cards = ref<CardState[]>([]);
const expandMap = ref<Record<string, boolean>>({});
const cameraCardModels = reactive<CuiCameraCardModels>({
  sourceRole: sourceRole.value,
  activityMode: activityMode.value,
  streamingMode: streamingMode.value,
});

const isLoading = computed(() => camerasLoading.value || viewsLoading.value || removeViewPending.value || addViewPending.value || patchViewPending.value);

const navbarOffset = computed(() => navbarWidth.value + navbarLeft.value);

const timelineLocaleSettings = computed<CuiTimelineLocale>(() => {
  return {
    locale: i18n.locale.value,
    dayNames: primevue.config.locale?.dayNames,
    dayNamesShort: primevue.config.locale?.dayNamesShort,
    monthNames: primevue.config.locale?.monthNames,
    monthNamesShort: primevue.config.locale?.monthNamesShort,
  };
});

const cameraCardProps = computed<Partial<CuiCameraCardProps>>(() => ({
  doubleClickZoom: false,
  flatCard: true,
  cameraNameOverlay: true,
  control: true,
  toolbar: false,
  expandableCard: (currentView.value?.cameras?.length ?? 0) > 1,
  detectionIndicatorOverlay: true,
  boundingBoxOverlay: false,
  cardClickAction: 'expand',
  viewTransition: true,
  cardProps: {
    pt: {
      root: {
        style: 'background: #000',
      },
    },
  },
}));

const contentContainerStyle = computed<HTMLAttributes['style']>(() => {
  if (!views.value?.result.length) {
    return {
      width: '100%',
      height: '100%',
      overflowY: 'scroll',
    };
  } else if (lgBreakpoint.value) {
    return {
      width: timelineSpaceOccupied.value ? 'calc(100% - 400px)' : '100%',
      height: '100%',
      overflowY: 'scroll',
    };
  } else {
    return {
      height: '100%',
      paddingBottom: timelineSpaceOccupied.value ? (bottombarHeight.value > 0 ? '200px' : '192px') : '0px',
      overflowY: 'scroll',
    };
  }
});

const editMode = computed(() => editView.value || newView.value);

const isFullscreen = computed(() => Boolean(viewDndRef.value?.isFullscreen));

const cameraButtons = computed<{ label: string; icon: any; buttonProps?: ButtonProps; command: () => void }[]>(() => [
  {
    label: isFullscreen.value ? t('components.form.tooltip.fullscreen_off') : t('components.form.tooltip.fullscreen_on'),
    icon: isFullscreen.value ? FullscreenOffIcon : FullscreenOnIcon,
    command: toggleFullscreen,
  },
  {
    label: isMuted.value ? t('components.form.tooltip.unmute') : t('components.form.tooltip.mute'),
    icon: isMuted.value ? SpeakerOffIcon : SpeakerOnIcon,
    command: togglePlayerMute,
  },
  {
    label: t('components.form.tooltip.intercom'),
    icon: MicrophoneIcon,
    command: () => openDialog('intercom'),
  },
  {
    label:
      streamingMode.value === 'auto'
        ? `${t('components.form.tooltip.mode')}: ${t('components.form.tooltip.streaming_mode_auto')}`
        : streamingMode.value === 'webrtc'
          ? `${t('components.form.tooltip.mode')}: ${t('components.form.tooltip.streaming_mode_webrtc')}`
          : `${t('components.form.tooltip.mode')}: ${t('components.form.tooltip.streaming_mode_mse')}`,
    icon: streamingMode.value === 'auto' ? StreamingModeAutoIcon : streamingMode.value === 'webrtc' ? StreamingModeWebrtcIcon : StreamingModeMseIcon,
    command: () => togglePlayerStreamingMode(),
  },
  {
    label:
      activityMode.value === 'always-on'
        ? t('components.form.tooltip.activity_mode_always_on')
        : activityMode.value === 'standby'
          ? t('components.form.tooltip.activity_mode_standby')
          : t('components.form.tooltip.activity_mode_activity'),
    icon: activityMode.value === 'always-on' ? ActivityModeWebcamIcom : activityMode.value === 'standby' ? ActivityModeSleepIcon : ActivityModeActivityIcon,
    command: () => togglePlayerActivityMode(),
  },
  {
    label:
      sourceRole.value === 'low-resolution'
        ? `${t('components.form.tooltip.resolution')}: ${t('components.form.tooltip.source_role_low')}`
        : sourceRole.value === 'mid-resolution'
          ? `${t('components.form.tooltip.resolution')}: ${t('components.form.tooltip.source_role_mid')}`
          : `${t('components.form.tooltip.resolution')}: ${t('components.form.tooltip.source_role_high')}`,
    icon: sourceRole.value === 'low-resolution' ? SourceRoleLowIcon : sourceRole.value === 'mid-resolution' ? SourceRoleMidIcon : SourceRoleHighIcon,
    command: () => togglePlayerSourceRole(),
  },
]);

const currentView = computed(() => {
  const view = views.value?.result.find((v) => v._id === uiSettings.value.camview.viewid) || views.value?.result[0];

  if (view) {
    viewForm.value = view;
    uiSettings.value.camview.viewid = view._id;
  } else {
    viewForm.value = {} as DBCamviewLayout;
  }

  return view;
});

const viewCameraIds = computed(() => {
  return currentView.value?.cameras?.map((c) => c.cameraId) ?? [];
});

// CamView forces `sourceRole: 'low'` across all tiles: many parallel 4K streams
// blow past iOS Safari's memory budget (decoded YUV frames ≈ 12 MB × buffer depth
// per tile). Scrub quality keeps decode + memory manageable at 10+ tiles.
const { master } = useMultiNvrPlayback(viewCameraIds, { sourceRole: 'low' });

// On re-open (timeline unmounts when minimized), seed CuiTimeline's scroll
// position from the held master playback time so the playback/live gap
// survives the remount instead of snapping back to the live edge.
const timelineInitialTimestamp = computed(() =>
  master.mode.value !== 'idle' && master.currentTimestamp.value > 0 ? Math.floor(master.currentTimestamp.value / 1000) : undefined,
);

const viewSize = computed<DBCamviewViewSize>(() => {
  if (editMode.value && viewForm.value.viewSize > 0) {
    return viewForm.value.viewSize;
  } else if (currentView.value) {
    return currentView.value.viewSize;
  } else {
    return 1;
  }
});

const items = computed(() => {
  const menuItems: MenuItem[] = [];

  for (const view of views.value?.result || []) {
    menuItems.push({
      label: view.name,
      active: view._id === currentView.value?._id,
      onClick: () => selectView(view),
    });
  }

  return menuItems;
});

const addViewItems = computed<MenuItem[]>(() => {
  return [
    {
      label: t('views.camview.new_view'),
      icon: NewViewIcon,
      onClick: () => openDialog('newView'),
    },
  ];
});

function openDialog(type: 'newView' | 'editView' | 'intercom' | 'removeView') {
  switch (type) {
    case 'newView':
    case 'editView': {
      const isEdit = type === 'editView';
      const title = isEdit ? t('components.dialog.title.edit_view') : t('components.dialog.title.new_view');

      if (isEdit) {
        editView.value = true;
      } else {
        newView.value = true;
      }

      dialog.openComponentDialog<CamviewFormProps>(CamviewFormDialog, {
        data: {
          title,
          loading: isLoading,
          confirmText: t('components.form.button.next'),
          contentProps: {
            form: isEdit ? viewForm.value : undefined,
            type: 'view',
            cameras: cameras.value?.result || [],
            views: views.value?.result || [],
          },
        },
        onConfirm: (data: DBCamviewLayout | undefined) => {
          if (data) {
            viewForm.value = data;
          }
        },
        onCancel: () => {
          newView.value = false;
        },
      });
      break;
    }
    case 'intercom':
      dialog.openComponentDialog<{}, { listening: (state: boolean) => void }>(AudioVisualizerDialog, {
        data: {
          title: t('components.dialog.title.intercom'),
          hideConfirmButton: true,
          loading: isLoading,
          contentProps: {},
        },
        events: {
          listening: toggleIntercom,
        },
      });
      break;
    case 'removeView':
      dialog.openTextDialog({
        data: {
          title: t('components.dialog.title.confirm'),
          confirmText: t('components.form.button.remove'),
          contentText: t('components.dialog.message.confirm_remove_layout'),
          confirmButtonProps: {
            severity: 'danger',
          },
        },
        onConfirm: removeView,
      });
      break;
  }
}

function selectView(view: DBCamviewLayout): void {
  uiSettings.value.camview.viewid = view._id;
}

function removeView() {
  if (!currentView.value || !user.value) {
    return;
  }

  deleteView(
    { username: user.value.username, viewid: currentView.value._id },
    {
      onSuccess: (data) => {
        if (data.length) {
          uiSettings.value.camview.viewid = data[0]._id;
        } else {
          uiSettings.value.camview.viewid = undefined;
        }
      },
    },
  );
}

async function changeOrAddView(): Promise<void> {
  if (!user.value || Object.keys(viewForm.value).length === 0) {
    return;
  }

  const addedCameras: DBCamviewLayoutCamera[] = cards.value
    .filter((card) => card.lastDroppedCamera)
    .map((card): DBCamviewLayoutCamera => ({
      cameraId: card.lastDroppedCamera!._id,
      index: card.index,
      colSpan: card.colSpan,
      rowSpan: card.rowSpan,
    }))
    .sort((a, b) => a.index - b.index);

  if (!addedCameras.length) {
    return;
  }

  const viewData = deepToRaw(viewForm.value);
  viewData.cameras = addedCameras;

  if (viewData._id) {
    const view = await patchView({ username: user.value.username, viewid: viewData._id, viewData });
    saveView(view);
  } else {
    const view = await addView({ username: user.value.username, viewData });
    saveView(view);
  }
}

function dropCamera(index: number, camera: DBCamera): void {
  cards.value[index].lastDroppedCamera = camera;
}

function removeCamera(camera: DBCamera): void {
  cards.value = cards.value.map((card) => {
    if (card.lastDroppedCamera?.name === camera.name) {
      card.lastDroppedCamera = undefined;
    }

    return card;
  });
}

function layoutKey(viewId: string): string {
  return `${smBreakpoint.value ? 'mobile' : 'desktop'}:${viewId}`;
}

function rearrangeCamera(cameras: DBCamviewLayoutCamera[]): void {
  const viewId = currentView.value?._id;
  if (!viewId) return;

  if (!uiSettings.value.camview.layouts) {
    uiSettings.value.camview.layouts = {};
  }
  uiSettings.value.camview.layouts[layoutKey(viewId)] = cameras.map((c) => ({
    index: c.index,
    cameraId: c.cameraId,
    x: c.x ?? 0,
    y: c.y ?? 0,
    w: c.colSpan ?? 1,
    h: c.rowSpan ?? 1,
  }));
}

function expandCamera(camera: DBCamera, expanded: boolean): void {
  expandMap.value[camera._id] = expanded;
}

function saveView(view: DBCamviewLayout): void {
  uiSettings.value.camview.viewid = view._id;
  newView.value = false;
  editView.value = false;
}

function toggleFullscreen() {
  viewDndRef.value?.toggleFullscreen();
}

function togglePlayerMute() {
  isMuted.value = !isMuted.value;
  viewDndRef.value?.toggleAllPlayerMute(isMuted.value);
}

function togglePlayerActivityMode(state?: CameraActivityMode) {
  let mode = activityMode.value;
  mode = state ? state : mode === 'always-on' ? 'standby' : mode === 'standby' ? 'activity' : 'always-on';
  viewDndRef.value?.toggleAllPlayerActivityMode(mode);
  activityMode.value = mode;
}

async function togglePlayerSourceRole(state?: StreamingRole) {
  let role = sourceRole.value;
  role = state ? state : role === 'low-resolution' ? 'mid-resolution' : role === 'mid-resolution' ? 'high-resolution' : 'low-resolution';
  await viewDndRef.value?.toggleAllPlayerSourceRole(role);
  sourceRole.value = role;
}

async function togglePlayerStreamingMode(state?: VideoStreamingMode) {
  // Cycle between concrete modes only (skip auto): mse -> webrtc -> webcodecs -> mse
  let currentMode = streamingMode.value;

  if (currentMode === 'auto') {
    currentMode = 'webrtc';
  }

  const mode = state ? state : currentMode === 'mse' ? 'webrtc' : 'mse';
  await viewDndRef.value?.toggleAllPlayerStreamingMode(mode);
  streamingMode.value = mode;
}

async function toggleIntercom(state: boolean) {
  await viewDndRef.value?.toggleAllPlayerMicrophone(state);
}

watch(timelineState, (active) => {
  if (active) timelineAnimating.value = true;
});

watch(
  [viewSize, currentView, cameras, editMode, uiSettings, smBreakpoint],
  () => {
    const cardsArray: CardState[] = Array.from({ length: viewSize.value }).map((_, index) => ({
      accept: 'camera',
      index,
      lastDroppedCamera: undefined,
    }));

    if (!newView.value) {
      const viewId = currentView.value?._id;
      const key = viewId ? layoutKey(viewId) : undefined;
      const layoutOverrides = key ? uiSettings.value.camview.layouts?.[key] : undefined;
      const availableCameraIds = new Set(cameras.value?.result.map((c) => c._id) ?? []);
      let layoutDirty = false;

      for (const cameraView of currentView.value?.cameras || []) {
        if (!cardsArray[cameraView.index]) continue;

        const cam = cameras.value?.result.find((c) => c._id === cameraView.cameraId);
        cardsArray[cameraView.index].lastDroppedCamera = cam;

        // Position overrides from localStorage — only if camera still exists
        const override = layoutOverrides?.find((o) => o.index === cameraView.index);
        if (override) {
          if (!override.cameraId || availableCameraIds.has(override.cameraId)) {
            cardsArray[cameraView.index].x = override.x;
            cardsArray[cameraView.index].y = override.y;
            cardsArray[cameraView.index].colSpan = override.w;
            cardsArray[cameraView.index].rowSpan = override.h;
          } else {
            layoutDirty = true;
          }
        }
      }

      // Clean stale overrides (deleted cameras) from localStorage
      if (layoutDirty && key && uiSettings.value.camview.layouts?.[key]) {
        uiSettings.value.camview.layouts[key] = uiSettings.value.camview.layouts[key].filter((o) => !o.cameraId || availableCameraIds.has(o.cameraId));
      }
    }

    cards.value = cardsArray;
  },
  { deep: true, immediate: true },
);
</script>

<style scoped>
/* Synchronized transition for content container when timeline shows/hides */
.camview-content-transition {
  transition:
    width 0.3s ease-out,
    height 0.3s ease-out,
    padding-bottom 0.3s ease-out;
}

/* Timeline slide-in from right (lgBreakpoint) */
.slide-left-enter-active,
.slide-left-leave-active {
  position: absolute;
  right: 0;
  top: 55px;
  bottom: 0;
  transition:
    transform 0.3s ease-out,
    opacity 0.3s ease-out;
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Timeline slide-in from bottom (smaller screens) - already fixed positioned */
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    transform 0.3s ease-out,
    opacity 0.3s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.p-divider-vertical:before {
  border-inline-start: 1px solid #2d2d2d;
}

/* SpeedDial: only enable list clicks when open */
:deep(.p-speeddial-open) .p-speeddial-list {
  pointer-events: auto;
}
</style>
