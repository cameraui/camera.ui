<template>
  <div>
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <SpeedDial
      :model="items"
      direction="up"
      :transition-delay="80"
      :tooltip-options="{ position: 'left', event: undefined }"
      class="absolute right-3 bottom-3 z-2"
      :pt="{ root: { style: 'pointer-events: none' } }"
    >
      <template #button="{ visible, toggleCallback }">
        <Button
          severity="secondary"
          class="opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100 transition pointer-events-auto"
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
                class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{
                  'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': visible,
                }"
                :style="{
                  backgroundColor: 'var(--text-color)',
                }"
              />
              <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
                :class="{
                  'opacity-0 scale-0': visible,
                }"
                :style="{
                  backgroundColor: 'var(--text-color)',
                }"
              />
              <div
                class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{
                  'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': visible,
                }"
                :style="{
                  backgroundColor: 'var(--text-color)',
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

    <Button
      class="opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100 transition absolute bottom-3 right-14 z-2"
      rounded
      :loading="isLoading"
      @click="toggleCurrentConfig"
    >
      <template #icon>
        <CuiCameraUiIcon v-if="currentConfig === 'camera.ui'" v-tooltip="{ value: 'camera.ui' }" class="fill-white w-[30px]" />
        <CuiGo2RtcIcon v-else v-tooltip="{ value: 'go2rtc' }" class="fill-white w-[30px]" />
      </template>
    </Button>

    <div class="w-full h-full">
      <Suspense>
        <CuiEditor
          v-if="currentConfig === 'camera.ui'"
          v-show="mounted"
          v-model="content"
          lang="yaml"
          :options="options"
          :read-only="isLoading"
          :border="!smBreakpoint"
          :border-bottom-left-radius="!smBreakpoint"
          :border-bottom-right-radius="!smBreakpoint"
          :border-top-right-radius="false"
          :border-top-left-radius="false"
        />

        <CuiEditor
          v-else
          v-show="mounted"
          v-model="go2rtcContent"
          lang="yaml"
          :options="options"
          :read-only="isLoading"
          :border-radius="!smBreakpoint"
          :border="!smBreakpoint"
        />

        <template #fallback>
          <div class="w-full h-full flex items-center justify-center">
            <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
          </div>
        </template>
      </Suspense>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sleep } from '@camera.ui/common/utils';
import SaveIcon from '~icons/dashicons/saved';
import ZoomInIcon from '~icons/tabler/zoom-in';
import ZoomOutIcon from '~icons/tabler/zoom-out';

import { ConfigQuery } from '@/api/routes/config.js';
import { ServerQuery } from '@/api/routes/server.js';

import type { Ace } from 'ace-builds';
import type { ButtonProps } from 'primevue';

const configQuery = new ConfigQuery();
const serverQuery = new ServerQuery();

const log = useLogger();
const dialog = useCuiDialog();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { beginServerRestart } = useServerRestart();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const json = ref(false);

const { data: configData, isBusy: configLoading } = configQuery.getConfigQuery(json);
const { data: go2rtcConfigData, isBusy: go2rtcConfigLoading } = configQuery.getGo2RtcConfigQuery(json);
const { mutateAsync: patchConfig, isPending: patchConfigLoading } = configQuery.patchConfigQuery();
const { mutateAsync: patchGo2RtcConfig, isPending: patchGo2rtcConfigLoading } = configQuery.patchGo2RtcConfigQuery();
const { mutateAsync: restartServer, isPending: restartSystemLoading } = serverQuery.restartServerQuery();
const { mutateAsync: restartGo2Rtc, isPending: restartGo2RtcLoading } = serverQuery.restartGo2RtcQuery();

const currentConfig = ref<'camera.ui' | 'go2rtc'>('camera.ui');
const content = ref('');
const go2rtcContent = ref('');
const mounted = ref(false);

const items = ref<{ label: string; icon: any; buttonProps?: ButtonProps; command: () => void }[]>([
  {
    label: t('components.dialog.title.confirm'),
    icon: SaveIcon,
    buttonProps: {
      severity: 'success',
    },
    command: () => {
      dialog.openTextDialog({
        data: {
          title: t('components.dialog.title.confirm'),
          contentText: t('components.dialog.message.confirm_restart_server'),
          confirmText: t('components.form.button.save_and_restart'),
          confirmButtonProps: {
            loading: isLoading.value,
          },
          cancelButtonProps: {
            loading: isLoading.value,
          },
        },
        onConfirm: saveAndRestart,
      });
    },
  },
  {
    label: t('components.form.tooltip.zoom_out'),
    icon: ZoomOutIcon,
    command: () => {
      zoomOut();
    },
  },
  {
    label: t('components.form.tooltip.zoom_in'),
    icon: ZoomInIcon,
    command: () => {
      zoomIn();
    },
  },
]);

const isLoading = computed(
  () =>
    configLoading.value ||
    go2rtcConfigLoading.value ||
    patchConfigLoading.value ||
    patchGo2rtcConfigLoading.value ||
    restartSystemLoading.value ||
    restartGo2RtcLoading.value,
);

// https://github.com/ajaxorg/ace/wiki/Configuring-Ace/
const options = computed<Partial<Ace.EditorOptions>>(() => {
  return {
    fontSize: uiSettings.value.config.zoom,
  };
});

async function saveAndRestart(): Promise<void> {
  try {
    if (currentConfig.value === 'camera.ui') {
      await patchConfig({ configData: content.value });
      await sleep(500);
      beginServerRestart();
      await restartServer();
    } else {
      await patchGo2RtcConfig({ configData: go2rtcContent.value });
      await sleep(500);
      await restartGo2Rtc();
    }
  } catch (error: any) {
    log.error(error);
  }
}

function toggleCurrentConfig(): void {
  currentConfig.value = currentConfig.value === 'camera.ui' ? 'go2rtc' : 'camera.ui';
}

function zoomIn(): void {
  if (uiSettings.value.config.zoom === 20) {
    return;
  }

  uiSettings.value.config.zoom++;
}

function zoomOut(): void {
  if (uiSettings.value.config.zoom === 8) {
    return;
  }

  uiSettings.value.config.zoom--;
}

watch(
  configData,
  () => {
    content.value = (configData.value as string) || '';
  },
  { deep: true, immediate: true },
);

watch(
  go2rtcConfigData,
  () => {
    go2rtcContent.value = (go2rtcConfigData.value as string) || '';
  },
  { deep: true, immediate: true },
);

onMounted(async () => {
  await sleep(100);
  mounted.value = true;
});
</script>

<style scoped></style>
