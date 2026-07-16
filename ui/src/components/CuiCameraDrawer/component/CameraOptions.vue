<template>
  <div class="drawer-header flex items-center w-full h-[45px] border-b-[1px] border-color px-3">
    <span class="font-semibold text-lg truncate">{{ cameraName }}</span>
    <Button text rounded severity="secondary" class="ml-auto cui-icon-md shrink-0" @click="emit('close')">
      <template #icon>
        <i-mdi:close width="100%" height="100%" />
      </template>
    </Button>
  </div>

  <Form
    ref="formRef"
    class="w-full"
    :style="{
      height: `calc(100% - 45px - ${showSaveButton ? '70px' : '0px'})`,
    }"
    :validation-schema="cameraPatchSchema"
  >
    <Tabs v-model:value="currentSegment" scrollable class="w-full h-full">
      <TabList class="justify-between" :pt="{ tablist: { class: 'h-[65px]' }, activeBar: { class: '!w-auto' } }">
        <!-- @vue-ignore -->
        <Tab v-for="(segment, i) in segments" :key="i" v-slot="slotProps" :value="segment.name" as-child>
          <div
            v-bind="(slotProps as any).a11yAttrs"
            class="flex flex-col items-center justify-center flex-1 content-background !py-3"
            :class="[
              {
                'hover:!text-color active:!text-color focus:!text-color': !(slotProps as any).active,
              },
              (slotProps as any).class,
            ]"
            @click="(slotProps as any).onClick"
          >
            <component :is="segment.icon" class="w-5 h-5" />
            <span class="text-xs truncate">{{ $t(`components.options_sidebar.segment_tab_${segment.name}`) }}</span>
          </div>
        </Tab>
      </TabList>

      <TabPanels class="p-0 h-[calc(100%-65px)]">
        <div class="w-full h-full max-h-full overflow-y-scroll">
          <!-- @vue-ignore -->
          <TabPanel v-for="(segment, i) in segments" :key="i" v-slot="slotProps" :value="segment.name" as-child>
            <div v-if="(slotProps as any).active" :class="(slotProps as any).class" v-bind="(slotProps as any).a11yAttrs">
              <div v-if="!cameraForm || !camera || !cameraDevice" class="flex w-full h-full items-center justify-center mt-5">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <div v-else class="w-full h-full">
                <Overview
                  v-if="currentSegment === 'overview'"
                  :camera
                  :camera-device
                  :loading="isLoading"
                  :latest-snapshot-src="latestSnapshotSrc"
                  @close="emit('close')"
                ></Overview>
                <Sources v-if="currentSegment === 'sources'" v-model="cameraForm" :camera :camera-device :loading="isLoading" @close="emit('close')"></Sources>
                <Settings v-if="currentSegment === 'settings'" v-model="cameraForm" :camera :camera-device :loading="isLoading" @close="emit('close')"></Settings>
                <Plugins v-if="currentSegment === 'plugins'" :camera :camera-device :loading="isLoading" @close="emit('close')"></Plugins>
              </div>
            </div>
          </TabPanel>
        </div>
      </TabPanels>
    </Tabs>

    <div v-if="showSaveButton" class="w-full flex items-center justify-center p-4 h-[70px]">
      <Button fluid severity="success" class="cui-button-medium" :label="$t('components.form.button.save')" @click="onFormSubmit"></Button>
    </div>
  </Form>
</template>

<script setup lang="ts">
import { Form } from 'vee-validate';
import CctvIcon from '~icons/bxs/cctv';
import SourceIcon from '~icons/humbleicons/url';
import SettingsIcon from '~icons/mdi/cog';
import PluginsIcon from '~icons/tabler/puzzle-filled';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { deepToRaw } from '@/common/utils.js';
import { cameraPatchSchema } from '@/schemas/cameras.schema.js';

import type { ReactiveCameraDevice } from '@camera.ui/browser';
import type { DBCamera } from '@shared/types';
import type { CameraOptionsEmits, CameraOptionsProps, CameraOptionsSegment } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CameraOptionsProps>();

const emit = defineEmits<CameraOptionsEmits>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const { latestSnapshotSrc } = toRefs(props);

const cameraName = ref(props.cameraName);

const { camera: liveCameraDevice, isLoading: cameraDeviceLoading } = useCameraById(cameraName);

const { data: camera, isBusy: cameraLoading } = camerasQuery.getCameraQuery(cameraName);
const { mutate: patchCamera, isPending: patchLoading } = camerasQuery.patchCameraQuery();

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const cameraDevice = shallowRef<ReactiveCameraDevice>();
const cameraForm = ref<DBCamera>();
const currentSegment = ref('overview');
const segments = ref<CameraOptionsSegment[]>([
  {
    name: 'overview',
    icon: CctvIcon,
  },
  {
    name: 'sources',
    icon: SourceIcon,
  },
  {
    name: 'settings',
    icon: SettingsIcon,
  },
  {
    name: 'plugins',
    icon: PluginsIcon,
  },
]);

const isLoading = computed(() => cameraLoading.value || cameraDeviceLoading.value || patchLoading.value);

const showSaveButton = computed(() => currentSegment.value === 'sources' || currentSegment.value === 'settings');

async function onFormSubmit() {
  const result = await formRef.value?.validate();
  if (result?.valid && result.values) {
    const newName = result.values.name;
    patchCamera(
      { cameraname: cameraName.value, cameraData: result.values },
      {
        onSuccess: () => {
          if (newName && newName !== cameraName.value) {
            cameraName.value = newName;
          }
        },
      },
    );
  } else {
    log.error('Validation failed', result);
    toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
  }
}

watch(
  liveCameraDevice,
  (device) => {
    if (device) {
      cameraDevice.value = device;
    }
  },
  { immediate: true },
);

watch(
  () => props.cameraName,
  (name) => {
    cameraDevice.value = undefined;
    cameraName.value = name;
  },
);

watch(
  camera,
  (data) => {
    if (data) {
      cameraForm.value = deepToRaw(data);
    }
  },
  { deep: true, immediate: true },
);
</script>

<style scoped>
.drawer-header {
  background: var(--p-drawer-background);
}
</style>
