<template>
  <Accordion multiple class="p-4">
    <AccordionPanel v-for="(source, i) in cameraForm.sources" :key="i" :value="i">
      <AccordionHeader
        :class="{
          'px-0 pt-0': i === 0,
          'px-0': i !== 0,
        }"
      >
        <div class="flex gap-2 items-center w-full">
          <span class="text-color font-normal">{{ $t('components.camera_options.source') + ': ' + getSourceName(source) }}</span>
          <Button text rounded :loading :disabled="cameraForm.sources.length < 2" severity="danger" class="cui-icon-md ml-auto mr-2" @click="removeSource(i)">
            <template #icon>
              <i-mdi:close width="100%" height="100%" />
            </template>
          </Button>
        </div>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Field v-slot="{ field, errors }" v-model.trim="source.name" :name="`sources[${i}].name`" as="div" class="flex flex-col field-gap">
            <label :for="`sources[${i}].name`" class="cui-label">{{ $t('components.form.label.source_name') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading :readonly="camera.sources.some((s) => s.name === source.name)" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage :name="`sources[${i}].name`" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.source_name')
            }}</Message>
          </Field>

          <CameraSource v-if="source._id" :camera-id="camera._id" :camera-name="camera.name" :source="source" :loading> </CameraSource>

          <Field v-slot="{ errors }" :model-value="source.role" :name="`sources[${i}].role`" as="div" class="flex flex-col field-gap">
            <label :for="`sources[${i}].role`" class="cui-label">{{ $t('components.form.label.source_role') }}</label>
            <InputGroup>
              <Select
                :model-value="source.role"
                :options="sourceRoles.filter((role) => !cameraForm.sources.some((s) => s.role === role && s._id !== source._id))"
                :invalid="errors.length > 0"
                :loading
                @value-change="(e) => (source.role = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage :name="`sources[${i}].role`" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.source_role')
            }}</Message>
          </Field>

          <div class="w-full flex flex-col gap-2">
            <Field
              v-if="source.role !== 'snapshot' && cameraForm.sources.length > 1"
              v-slot="{ field, errors }"
              :model-value="source.useForSnapshot"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              :name="`sources[${i}].useForSnapshot`"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label :for="`sources[${i}].useForSnapshot`" class="cui-label-switch">{{ $t('components.form.label.use_for_snapshot') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.use_for_snapshot') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage :name="`sources[${i}].useForSnapshot`" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="source.useForSnapshot"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading
                  :disabled="cameraForm.sources.some((s) => (s.useForSnapshot || s.role === 'snapshot') && s._id !== source._id)"
                  class="ml-auto shrink-0"
                  @value-change="(e) => (source.useForSnapshot = e)"
                />
              </div>
            </Field>

            <Field
              v-if="source.role !== 'snapshot'"
              v-slot="{ field, errors }"
              :model-value="source.hotMode"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              :name="`sources[${i}].hotMode`"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label :for="`sources[${i}].hotMode`" class="cui-label-switch">{{ $t('components.form.label.hot_mode') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.hot_mode') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage :name="`sources[${i}].hotMode`" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="source.hotMode"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading
                  class="ml-auto shrink-0"
                  @value-change="(e) => (source.hotMode = e)"
                />
              </div>
            </Field>

            <Field
              v-if="source.role !== 'snapshot'"
              v-slot="{ field, errors }"
              :model-value="source.preload"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              :name="`sources[${i}].preload`"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label :for="`sources[${i}].preload`" class="cui-label-switch">{{ $t('components.form.label.preload') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.preload') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage :name="`sources[${i}].preload`" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="source.preload"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading
                  class="ml-auto shrink-0"
                  @value-change="(e) => (source.preload = e)"
                />
              </div>
            </Field>

            <Field
              v-if="source.role !== 'snapshot'"
              v-slot="{ field, errors }"
              :model-value="source.muted"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              :name="`sources[${i}].muted`"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label :for="`sources[${i}].muted`" class="cui-label-switch">{{ $t('components.form.label.muted') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.muted') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage :name="`sources[${i}].muted`" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="source.muted"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading
                  class="ml-auto shrink-0"
                  @value-change="(e) => (source.muted = e)"
                />
              </div>
            </Field>
          </div>

          <Field
            v-if="source.role !== 'snapshot'"
            v-slot="{ errors }"
            :model-value="getChildSourceValue(i)"
            :name="`sources[${i}].childSourceId`"
            as="div"
            class="flex flex-col field-gap"
          >
            <label :for="`sources[${i}].childSourceId`" class="cui-label">{{ $t('components.form.label.pip_source') }}</label>
            <InputGroup>
              <Select
                :model-value="getChildSourceValue(i)"
                :options="getChildSourceOptions(i)"
                option-label="label"
                option-value="value"
                :invalid="errors.length > 0"
                :loading
                :placeholder="$t('components.form.label.none')"
                show-clear
                @value-change="(e) => setChildSource(i, e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage :name="`sources[${i}].childSourceId`" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.pip_source') }}</Message>
          </Field>

          <div class="flex flex-col gap-6">
            <div class="flex flex-col field-gap">
              <label :for="`sources[${i}].urls[]`" class="cui-label">{{ $t('components.form.label.sources') }}</label>
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.source_urls') }}</Message>
            </div>
            <Field
              v-for="(_url, i2) in source.urls"
              :key="i2"
              v-slot="{ field, errors }"
              v-model.trim="source.urls[i2]"
              :name="`sources[${i}].urls[${i2}]`"
              as="div"
              class="flex flex-col field-gap"
            >
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading type="text" />

                <InputGroupAddon v-if="source.urls.length > 1">
                  <Button text severity="secondary" :loading class="cui-icon-md" @click="deleteSource(i, i2)">
                    <template #icon>
                      <i-mdi:close width="100%" height="100%" />
                    </template>
                  </Button>
                </InputGroupAddon>
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage :name="`sources[${i}].urls[${i2}]`" class="cui-input-error" />
              </Transition>
            </Field>

            <Button :loading :label="$t('components.form.button.add_source')" class="ml-auto cui-button-medium" @click="addSource(i)" />
          </div>
        </div>
      </AccordionContent>
    </AccordionPanel>
  </Accordion>

  <div class="w-full flex items-center justify-center my-3">
    <Button text rounded :loading class="cui-icon-xl" @click="newSource">
      <template #icon>
        <i-mdi:plus-circle width="100%" height="100%" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ErrorMessage, Field } from 'vee-validate';

import type { CameraRole } from '@camera.ui/sdk';
import type { CameraInputSettings } from '@camera.ui/sdk/internal';
import type { DBCamera } from '@shared/types';
import type { CameraOptionsTabEmits, CameraOptionsTabProps, ChildSourceOption } from '../../types.js';

const props = defineProps<CameraOptionsTabProps>();

defineEmits<CameraOptionsTabEmits>();

const cameraForm = defineModel<DBCamera>({
  required: true,
});

const { t } = useI18n();
const { camera, loading } = toRefs(props);

const sourceRoles = ref<CameraRole[]>(['high-resolution', 'mid-resolution', 'low-resolution', 'snapshot']);

function getSourceName(source: CameraInputSettings): string {
  return source.name.replace(/ /g, '_').toLowerCase();
}

function getChildSourceOptions(currentSourceIndex: number): ChildSourceOption[] {
  const options: ChildSourceOption[] = [{ label: t('components.form.label.none'), value: undefined }];
  const currentSource = cameraForm.value.sources[currentSourceIndex];
  const currentCamera = cameraForm.value;

  for (const source of currentCamera.sources) {
    if (source.role === 'snapshot') continue;
    if (source._id === currentSource._id) continue;
    if (!source.name || !source._id) continue;

    options.push({
      label: source.name,
      value: source._id,
    });
  }

  return options;
}

function getChildSourceValue(sourceIndex: number): string | undefined {
  return cameraForm.value.sources[sourceIndex].childSourceId;
}

function setChildSource(sourceIndex: number, value: string | undefined | null): void {
  if (value === undefined || value === null) {
    // Explicitly set to null so it's included in the PATCH request
    (cameraForm.value.sources[sourceIndex] as any).childSourceId = null;
  } else {
    cameraForm.value.sources[sourceIndex].childSourceId = value;
  }
}

function addSource(i: number): void {
  cameraForm.value.sources[i].urls.push('');
}

function removeSource(i: number): void {
  cameraForm.value.sources.splice(i, 1);
}

function deleteSource(i: number, i2: number): void {
  cameraForm.value.sources[i].urls.splice(i2, 1);
}

function newSource(): void {
  if (cameraForm.value) {
    cameraForm.value.sources.push({
      _id: '',
      name: '',
      role: null as any,
      urls: [],
      useForSnapshot: false,
      hotMode: true,
      preload: true,
      muted: false,
    });
  }
}
</script>

<style scoped></style>
