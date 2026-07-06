<template>
  <Form ref="formRef" class="flex flex-col gap-6" :validation-schema="userPreferencesCamviewViewsLayoutSchema" :initial-values="viewForm">
    <Field v-slot="{ field, errors }" v-model.trim="viewForm.name" name="name" as="div" class="flex flex-col field-gap">
      <label for="name" class="cui-label">{{ $t('components.form.label.name') }}</label>
      <InputGroup>
        <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="name" class="cui-input-error" />
      </Transition>
    </Field>

    <Divider class="m-0 py-3" />

    <div v-if="type === 'dnd'" class="flex flex-col gap-6 justify-center">
      <Transition name="fade">
        <span v-if="noCamerasSelected" class="text-red-500 text-center mb-5">{{ $t('components.form.error.no_cameras_selected') }}</span>
      </Transition>

      <div class="md:max-h-[350px] overflow-y-auto">
        <label class="block cui-label mb-3">{{ $t('components.form.label.cameras') }}</label>
        <div v-for="(camera, index) in cameras" :key="index" class="cui-list-item">
          <CuiListItem class="h-14" :active="selectedDndCameras.some((c) => c.name === camera.name)" @click="toggleCamera(camera)">
            <span>{{ camera.name }}</span>

            <template #append>
              <ToggleSwitch :model-value="selectedDndCameras.some((c) => c.name === camera.name)" @update:model-value="toggleCamera(camera)" />
            </template>
          </CuiListItem>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col gap-6 justify-center">
      <Transition name="fade">
        <span v-if="noViewSelected" class="text-red-500 text-center mb-5">{{ $t('components.form.error.no_view_selected') }}</span>
      </Transition>

      <div class="md:max-h-[450px] overflow-y-auto">
        <label class="block cui-label mb-3">{{ $t('components.form.label.views') }}</label>
        <div class="view-select-container">
          <div v-for="i in availableViews" :key="i" class="view-select-item w-full" @click="viewForm.viewSize = i">
            <div class="view-select-item-icon w-full p-3" :class="{ 'selected-view': viewForm.viewSize === i }">
              <component :is="resolveIcon(i)" style="width: 100%; height: 100%" />
            </div>

            <span class="view-select-item-label text-muted mt-3 px-2 py-1 cui-rounded-corners" :class="{ 'selected-view-label': viewForm.viewSize === i }"
              >{{ i }} {{ $t('views.camview.cameras') }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </Form>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';

import { UsersQuery } from '@/api/routes/users.js';
import { deepToRaw } from '@/common/utils.js';
import CuiCameraGridIcon1 from '@/components/CuiIcons/CuiCameraGridIcon1.vue';
import CuiCameraGridIcon10 from '@/components/CuiIcons/CuiCameraGridIcon10.vue';
import CuiCameraGridIcon12 from '@/components/CuiIcons/CuiCameraGridIcon12.vue';
import CuiCameraGridIcon13 from '@/components/CuiIcons/CuiCameraGridIcon13.vue';
import CuiCameraGridIcon15 from '@/components/CuiIcons/CuiCameraGridIcon15.vue';
import CuiCameraGridIcon16 from '@/components/CuiIcons/CuiCameraGridIcon16.vue';
import CuiCameraGridIcon20 from '@/components/CuiIcons/CuiCameraGridIcon20.vue';
import CuiCameraGridIcon26 from '@/components/CuiIcons/CuiCameraGridIcon26.vue';
import CuiCameraGridIcon4 from '@/components/CuiIcons/CuiCameraGridIcon4.vue';
import CuiCameraGridIcon6 from '@/components/CuiIcons/CuiCameraGridIcon6.vue';
import CuiCameraGridIcon7 from '@/components/CuiIcons/CuiCameraGridIcon7.vue';
import CuiCameraGridIcon9 from '@/components/CuiIcons/CuiCameraGridIcon9.vue';
import { userPreferencesCamviewViewsLayoutSchema } from '@/schemas/users.schema.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { DBCamera, DBCamviewLayout, DBCamviewLayoutCamera, DBCamviewViewSize } from '@shared/types';
import type { CamviewFormProps } from './types.js';

const usersQuery = new UsersQuery();

const props = defineProps<CamviewFormProps>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { mutateAsync: addView, isPending: addViewPending } = usersQuery.createViewQuery();
const { mutateAsync: patchView, isPending: patchViewPending } = usersQuery.patchViewQuery();

const { form, type, cameras, views } = toRefs(props);
const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const availableViews = ref<DBCamviewViewSize[]>([1, 4, 6, 7, 9, 10, 12, 13, 15, 16, 20, 26]);
const noViewSelected = ref(true);
const noCamerasSelected = ref(true);
const selectedDndCameras = ref<DBCamera[]>([]);
const isEditing = ref(Boolean(form.value));
const viewForm = ref<DBCamviewLayout>(form.value ? deepToRaw(form.value) : ({} as DBCamviewLayout));

if (!isEditing.value && type.value === 'view') {
  viewForm.value.viewSize = availableViews.value[0];
}

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || addViewPending.value || patchViewPending.value));

function toggleCamera(camera: DBCamera): void {
  const index = selectedDndCameras.value.findIndex((c) => c.name === camera.name);

  if (index === -1) {
    selectedDndCameras.value.push(camera);
  } else {
    selectedDndCameras.value.splice(index, 1);
  }
}

function resolveIcon(size: DBCamviewViewSize): any {
  switch (size) {
    case 1:
      return CuiCameraGridIcon1;
    case 4:
      return CuiCameraGridIcon4;
    case 6:
      return CuiCameraGridIcon6;
    case 7:
      return CuiCameraGridIcon7;
    case 9:
      return CuiCameraGridIcon9;
    case 10:
      return CuiCameraGridIcon10;
    case 12:
      return CuiCameraGridIcon12;
    case 13:
      return CuiCameraGridIcon13;
    case 15:
      return CuiCameraGridIcon15;
    case 16:
      return CuiCameraGridIcon16;
    case 20:
      return CuiCameraGridIcon20;
    case 26:
      return CuiCameraGridIcon26;
    default:
      return CuiCameraGridIcon1;
  }
}

async function onConfirm(): Promise<DBCamviewLayout | null | undefined> {
  if (!formRef.value || !user.value) {
    return;
  }

  const viewAlreadyExist = views.value.find((view) => view.name === viewForm.value.name);
  if (viewAlreadyExist && !isEditing.value) {
    log.error('View already exists', viewAlreadyExist);
    toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
    return null;
  }

  if (type.value === 'dnd') {
    if (noCamerasSelected.value) {
      log.error('No cameras selected');
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }

    const addedCameras: DBCamviewLayoutCamera[] = selectedDndCameras.value.map((camera, index) => ({
      cameraId: camera._id,
      index,
    }));

    viewForm.value.cameras = addedCameras;
    viewForm.value.type = 'dnd';
    viewForm.value.viewSize = 1;

    formRef.value.setFieldValue('type', 'dnd');
    formRef.value.setFieldValue('viewSize', 1);
    formRef.value.setFieldValue('cameras', addedCameras);

    const result = await formRef.value.validate();

    if (!result?.valid) {
      log.error('Validation failed', result);
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }

    if (isEditing.value) {
      return await patchView({ username: user.value.username, viewid: viewForm.value._id, viewData: viewForm.value });
    } else {
      return await addView({ username: user.value.username, viewData: viewForm.value });
    }
  } else {
    if (noViewSelected.value) {
      log.error('No view selected');
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }

    viewForm.value.cameras = [];
    viewForm.value.type = 'view';

    formRef.value.setFieldValue('type', 'view');
    formRef.value.setFieldValue('cameras', []);

    const result = await formRef.value.validate();

    if (!result?.valid) {
      log.error('Validation failed', result);
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }

    return deepToRaw(viewForm.value);
  }
}

watch(
  viewForm,
  (newForm) => {
    for (const [key, val] of Object.entries(newForm)) {
      formRef.value?.setFieldValue(key, val);
    }

    if (newForm.viewSize) {
      noViewSelected.value = false;
    }

    if (newForm.cameras?.length) {
      noCamerasSelected.value = false;
    }
  },
  { deep: true, immediate: true },
);

watch(
  selectedDndCameras,
  (newCameras) => {
    noCamerasSelected.value = newCameras.length === 0;
  },
  { deep: true },
);

onMounted(() => {
  selectedDndCameras.value = cameras.value?.filter((camera) => viewForm.value?.cameras?.some((c) => c.cameraId === camera._id)) || [];
});

defineExpose({
  isLoading,
  onConfirm,
});
</script>

<style scoped>
.view-select-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 30px;
}

.view-select-item {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.view-select-item-icon {
  transition: box-shadow 0.2s;
  background: var(--border-color);
  border-radius: 10px;
}

.view-select-item-label {
  font-size: 14px;
  border-radius: 4px;
}

.view-select-item:hover .view-select-item-icon,
.selected-view {
  box-shadow: inset 0px 0px 0px 1px var(--text-primary-color);
}

.view-select-item:hover .view-select-item-label,
.selected-view-label {
  transition: background 0.2s;
  background: var(--text-primary-color);
  color: #fff !important;
}
</style>
