<template>
  <!-- eslint-disable vue/no-mutating-props -- form is a shared reactive object owned by the parent dialog -->
  <div class="flex flex-col gap-6">
    <Field v-slot="{ field, errors }" v-model.trim="form.name" name="name" as="div" class="flex flex-col field-gap">
      <label for="name" class="cui-label">{{ $t('components.form.label.name') }}</label>
      <InputGroup>
        <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="name" class="cui-input-error" />
      </Transition>

      <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.camera_name') }}</Message>
    </Field>

    <div class="flex flex-col field-gap">
      <label for="type" class="cui-label">{{ $t('components.form.label.type') }}</label>
      <InputGroup>
        <Select :model-value="form.type" :options="cameraTypes" :loading="isLoading" type="text" @value-change="(e) => (form.type = e)" />
      </InputGroup>
    </div>

    <div class="flex flex-col field-gap">
      <label for="room" class="cui-label">{{ $t('components.form.label.room') }}</label>
      <CuiRoomSelect :model-value="form.roomId" @update:model-value="onPickRoom" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.room') }}</Message>
    </div>

    <slot />

    <Accordion>
      <AccordionPanel value="branding">
        <AccordionHeader class="px-0 pt-0">
          <span class="text-color font-normal">{{ $t('components.camera_options.branding') }}</span>
        </AccordionHeader>
        <AccordionContent :pt="{ content: { class: 'px-0' } }">
          <div class="flex flex-col gap-6">
            <Field v-slot="{ field, errors }" v-model.trim="form.info.manufacturer" name="info.manufacturer" as="div" class="flex flex-col field-gap">
              <label for="info.manufacturer" class="cui-label">{{ $t('components.form.label.manufacturer') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="info.manufacturer" class="cui-input-error" />
              </Transition>
            </Field>

            <Field v-slot="{ field, errors }" v-model.trim="form.info.model" name="info.model" as="div" class="flex flex-col field-gap">
              <label for="info.model" class="cui-label">{{ $t('components.form.label.model') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="info.model" class="cui-input-error" />
              </Transition>
            </Field>

            <Field v-slot="{ field, errors }" v-model.trim="form.info.hardware" name="info.hardware" as="div" class="flex flex-col field-gap">
              <label for="info.hardware" class="cui-label">{{ $t('components.form.label.hardware_version') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="info.hardware" class="cui-input-error" />
              </Transition>
            </Field>

            <Field v-slot="{ field, errors }" v-model.trim="form.info.serialNumber" name="info.serialNumber" as="div" class="flex flex-col field-gap">
              <label for="info.serialNumber" class="cui-label">{{ $t('components.form.label.serial_number') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="info.serialNumber" class="cui-input-error" />
              </Transition>
            </Field>

            <Field v-slot="{ field, errors }" v-model.trim="form.info.firmwareVersion" name="info.firmwareVersion" as="div" class="flex flex-col field-gap">
              <label for="info.firmwareVersion" class="cui-label">{{ $t('components.form.label.firmware_version') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="info.firmwareVersion" class="cui-input-error" />
              </Transition>
            </Field>

            <Field v-slot="{ field, errors }" v-model.trim="form.info.supportUrl" name="info.supportUrl" as="div" class="flex flex-col field-gap">
              <label for="info.supportUrl" class="cui-label">{{ $t('components.form.label.support_url') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="info.supportUrl" class="cui-input-error" />
              </Transition>
            </Field>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { ErrorMessage, Field } from 'vee-validate';

import type { CameraType } from '@camera.ui/sdk';
import type { CuiCameraDetailsFieldsProps } from './types.js';

const props = defineProps<CuiCameraDetailsFieldsProps>();

const cameraTypes = ref<CameraType[]>(['camera', 'doorbell']);

function onPickRoom(roomId: string | null): void {
  // eslint-disable-next-line vue/no-mutating-props
  props.form.roomId = roomId;
}
</script>

<style scoped></style>
