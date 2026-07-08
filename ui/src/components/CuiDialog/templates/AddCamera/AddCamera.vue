<template>
  <div>
    <Form ref="formRef" class="flex flex-col w-full gap-6" :validation-schema="cameraCreateSchema">
      <div>
        <span class="card-title">{{ $t('components.dialog.components.new_camera.camera') }}</span>
        <Card class="cui-card">
          <template #content>
            <CuiCameraDetailsFields :form="cameraForm" :is-loading="isLoading" />
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('components.form.label.sources') }}</span>
        <Card class="cui-card border-color-inner" :pt="{ body: { class: 'pb-0' } }">
          <template #content>
            <CuiCameraSources ref="sourcesRef" :sources="cameraForm.sources" :is-loading="isLoading" :allow-add-remove-sources="true" />
          </template>
        </Card>

        <div class="w-full flex items-center justify-center mt-4">
          <Button text rounded :loading="isLoading" class="cui-icon-2xl" @click="sourcesRef?.newSource()">
            <template #icon>
              <i-mdi:plus-circle width="100%" height="100%" />
            </template>
          </Button>
        </div>
      </div>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { Form } from 'vee-validate';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { fixSource } from '@/common/cameraSources.js';
import { deepToRaw } from '@/common/utils.js';
import { cameraCreateSchema } from '@/schemas/cameras.schema.js';
import { DEFAULT_CAMERA } from './types.js';

import type { CreateCameraInput } from '@shared/types';
import type { AddCameraProps, CameraFormModel, CameraFormModelInput } from './types.js';

const camerasQuery = new CamerasQuery();

const props = withDefaults(defineProps<AddCameraProps>(), {
  camera: () => DEFAULT_CAMERA,
});

const toast = useCuiToast();
const { t } = useI18n();

const { mutateAsync: addCamera, isPending: addLoading } = camerasQuery.createCameraQuery();

const { camera } = toRefs(props);
const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const sourcesRef = useTemplateRef<{ newSource: () => void }>('sourcesRef');
const cameraForm = ref<CameraFormModel>(deepToRaw(camera.value));

const isLoading = computed(() => addLoading.value);

async function onSave() {
  const result = await formRef.value?.validate();

  if (!result?.valid) {
    toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
    return null;
  }

  const cameraData = deepToRaw(cameraForm.value) as CameraFormModelInput;

  const newCameraData: CreateCameraInput = {
    ...cameraData,
    type: cameraData.type,
    isCloud: false,
    detectionZones: [],
    detectionLines: [],
    detectionSettings: {
      motion: {
        resolution: 'medium',
        timeout: 30,
      },
      object: {
        confidence: 0.7,
      },
      audio: {
        minDecibels: -40,
        timeout: 30,
      },
      sensor: {
        timeout: 30,
        triggers: [],
      },
      cascadeDetection: true,
      cascadeTimeout: 10,
      snooze: false,
    },
    ptzAutotrack: {
      enabled: false,
      targetLabels: ['person'],
      minConfidence: 0.5,
      triggerDeadZone: 0.05,
      trackingSpeed: 2,
      leadFrames: 3,
      panRate: 0.85,
      returnToHome: false,
      homeWaitMs: 10000,
    },
    frameWorkerSettings: {
      fps: 10,
      hqSnapshots: false,
    },
    snapshotSettings: {
      autoRefresh: false,
      ttl: 50,
      interval: 60,
    },
    plugins: cameraData.plugins || [],
    assignments: cameraData.assignments || {},
    sources: cameraData.sources.map((input) => {
      const urls: string[] = input.urls
        .map((source) => {
          if (source.url) {
            return fixSource(source);
          }
        })
        .filter(Boolean) as string[];

      return {
        ...input,
        urls,
      };
    }),
  };

  await addCamera({ cameraData: newCameraData });
}

defineExpose({
  isLoading,
  onSave,
  onConfirm: onSave,
});
</script>

<style scoped></style>
