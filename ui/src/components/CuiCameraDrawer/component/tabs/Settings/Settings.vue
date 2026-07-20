<template>
  <Accordion multiple class="p-4">
    <AccordionPanel value="general">
      <AccordionHeader class="px-0 pt-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.general') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.general_hint') }}
          </Message>
          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.name" name="name" as="div" class="flex flex-col field-gap">
            <label for="name" class="cui-label">{{ $t('components.form.label.name') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="name" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ errors }" :model-value="cameraForm.room" name="room" as="div" class="flex flex-col field-gap">
            <label for="room" class="cui-label">{{ $t('components.form.label.room') }}</label>
            <div class="flex gap-2">
              <Select
                :model-value="cameraForm.room"
                :options="roomOptions"
                option-label="label"
                option-value="value"
                :invalid="errors.length > 0"
                :loading="roomsLoading"
                class="w-full"
                @update:model-value="(e) => (cameraForm.room = e)"
              />
              <Button
                v-tooltip.top="$t('components.form.button.create_room')"
                severity="secondary"
                outlined
                class="shrink-0 h-[42px] w-[42px] p-0"
                @click="openCreateRoomDialog"
              >
                <template #icon><i-mdi:plus class="w-4 h-4" /></template>
              </Button>
            </div>
            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.room') }}</Message>
          </Field>

          <Field v-slot="{ errors }" :model-value="cameraForm.type" name="type" as="div" class="flex flex-col field-gap">
            <label for="type" class="cui-label">{{ $t('components.form.label.type') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.type"
                :options="cameraTypes"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.type = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="type" class="cui-input-error" />
            </Transition>
          </Field>

          <div class="w-full flex flex-col gap-2">
            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.disabled"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="disabled"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="disabled" class="cui-label-switch">{{ $t('components.form.label.disabled') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.disable_camera') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage name="disabled" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="cameraForm.disabled"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="(e) => (cameraForm.disabled = e)"
                />
              </div>
            </Field>
          </div>

          <Button fluid severity="danger" :loading="isLoading" class="cui-button-medium" :label="$t('components.form.button.remove')" @click="deleteCamera()" />
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="branding">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.branding') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.branding_hint') }}
          </Message>
          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.info.manufacturer" name="info.manufacturer" as="div" class="flex flex-col field-gap">
            <label for="info.manufacturer" class="cui-label">{{ $t('components.form.label.manufacturer') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="info.manufacturer" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.info.model" name="info.model" as="div" class="flex flex-col field-gap">
            <label for="info.model" class="cui-label">{{ $t('components.form.label.model') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="info.model" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.info.hardware" name="info.hardware" as="div" class="flex flex-col field-gap">
            <label for="info.hardware" class="cui-label">{{ $t('components.form.label.hardware_version') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="info.hardware" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.info.serialNumber" name="info.serialNumber" as="div" class="flex flex-col field-gap">
            <label for="info.serialNumber" class="cui-label">{{ $t('components.form.label.serial_number') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="info.serialNumber" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.info.firmwareVersion" name="info.firmwareVersion" as="div" class="flex flex-col field-gap">
            <label for="info.firmwareVersion" class="cui-label">{{ $t('components.form.label.firmware_version') }}</label>
            <InputGroup>
              <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="info.firmwareVersion" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ field, errors }" v-model.trim="cameraForm.info.supportUrl" name="info.supportUrl" as="div" class="flex flex-col field-gap">
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

    <AccordionPanel value="interface">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.interface') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.interface_hint') }}
          </Message>
          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.interfaceSettings.streamingMode"
            name="interfaceSettings.streamingMode"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="interfaceSettings.streamingMode" class="cui-label">{{ $t('components.form.label.streaming_mode') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.interfaceSettings.streamingMode"
                :options="streamingModes"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.interfaceSettings.streamingMode = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="interfaceSettings.streamingMode" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.streaming_mode')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.interfaceSettings.streamingSource"
            name="interfaceSettings.streamingSource"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="interfaceSettings.streamingSource" class="cui-label">{{ $t('components.form.label.streaming_source') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.interfaceSettings.streamingSource"
                :options="streamingSources"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.interfaceSettings.streamingSource = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="interfaceSettings.streamingSource" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.streaming_source')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.interfaceSettings.aspectRatio"
            name="interfaceSettings.aspectRatio"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="interfaceSettings.aspectRatio" class="cui-label">{{ $t('components.form.label.aspect_ratio') }}</label>
            <InputGroup>
              <InputText
                :model-value="cameraForm.interfaceSettings.aspectRatio"
                :invalid="errors.length > 0"
                readonly
                tabindex="-1"
                class="cursor-pointer"
                @click="openAspectRatioDialog"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="interfaceSettings.aspectRatio" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.aspect_ratio')
            }}</Message>
          </Field>
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="detection">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.detection') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.detection_hint') }}
          </Message>
          <div class="w-full flex flex-col gap-2">
            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.detectionSettings?.snooze"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="detectionSettings.snooze"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="detectionSettings.snooze" class="cui-label-switch">{{ $t('components.form.label.snooze') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.snooze_camera') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage name="detectionSettings.snooze" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="cameraForm.detectionSettings?.snooze"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="
                    (e) => {
                      if (cameraForm.detectionSettings) cameraForm.detectionSettings.snooze = e;
                    }
                  "
                />
              </div>
            </Field>
          </div>

          <span class="section-title mt-2">{{ $t('components.camera_options.sensor_type_motion') }}</span>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.motion.resolution"
            name="detectionSettings.motion.resolution"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.motion.resolution" class="cui-label">{{ $t('components.form.label.motion_resolution') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.detectionSettings.motion.resolution"
                :options="motionResolutions"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.detectionSettings.motion.resolution = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.motion.resolution" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.motion_resolution')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.motion.timeout"
            name="detectionSettings.motion.timeout"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.motion.timeout" class="cui-label">{{ $t('components.form.label.motion_timeout') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.motion.timeout"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :min="10"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.motion.timeout = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.motion.timeout = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.motion.timeout" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.motion_timeout')
            }}</Message>
          </Field>

          <span class="section-title mt-2">{{ $t('components.camera_options.sensor_type_object') }}</span>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.object.confidence"
            name="detectionSettings.object.confidence"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.object.confidence" class="cui-label">{{ $t('components.form.label.confidence') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.object.confidence"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.01"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.object.confidence = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.object.confidence = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.object.confidence" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.confidence') }}</Message>
          </Field>

          <Field
            v-slot="{ field, errors }"
            :model-value="cameraForm.detectionSettings.object.suppressStatic ?? true"
            :value="true"
            :unchecked-value="false"
            type="checkbox"
            name="detectionSettings.object.suppressStatic"
            as="div"
            class="flex flex-col field-gap cui-toggle-switch"
          >
            <div class="flex items-center gap-4">
              <div class="flex flex-col field-switch-gap">
                <label for="detectionSettings.object.suppressStatic" class="cui-label-switch">{{ $t('components.form.label.suppress_static') }}</label>

                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.suppress_static') }}</Message>

                <Transition name="fade">
                  <ErrorMessage name="detectionSettings.object.suppressStatic" class="cui-input-switch-error" />
                </Transition>
              </div>

              <ToggleSwitch
                :model-value="cameraForm.detectionSettings.object.suppressStatic ?? true"
                v-bind="field"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="ml-auto shrink-0"
                @value-change="(e) => (cameraForm.detectionSettings.object.suppressStatic = e)"
              />
            </div>
          </Field>

          <span class="section-title mt-2">{{ $t('components.camera_options.sensor_type_audio') }}</span>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.audio.minDecibels"
            name="detectionSettings.audio.minDecibels"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.audio.minDecibels" class="cui-label">{{ $t('components.form.label.audio_min_decibels') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.audio.minDecibels"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="1"
                :min="-100"
                :max="0"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.audio.minDecibels = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.audio.minDecibels = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.audio.minDecibels" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.audio_min_decibels')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.audio.timeout"
            name="detectionSettings.audio.timeout"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.audio.timeout" class="cui-label">{{ $t('components.form.label.audio_timeout') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.audio.timeout"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :min="10"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.audio.timeout = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.audio.timeout = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.audio.timeout" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.audio_timeout')
            }}</Message>
          </Field>

          <span class="section-title mt-2">{{ $t('components.camera_options.sensor_type_face') }}</span>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.face?.confidence"
            name="detectionSettings.face.confidence"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.face.confidence" class="cui-label">{{ $t('components.form.label.face_confidence') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.face?.confidence"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.01"
                :min="0"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.face = { confidence: e ?? undefined })"
                @input="(e) => (cameraForm.detectionSettings.face = { confidence: (e.value as any) ?? undefined })"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.face.confidence" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.face_confidence')
            }}</Message>
          </Field>

          <span class="section-title mt-2">{{ $t('components.camera_options.sensor_type_licensePlate') }}</span>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.licensePlate?.confidence"
            name="detectionSettings.licensePlate.confidence"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.licensePlate.confidence" class="cui-label">{{ $t('components.form.label.plate_confidence') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.licensePlate?.confidence"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.01"
                :min="0"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.licensePlate = { ...cameraForm.detectionSettings.licensePlate, confidence: e ?? undefined })"
                @input="(e) => (cameraForm.detectionSettings.licensePlate = { ...cameraForm.detectionSettings.licensePlate, confidence: (e.value as any) ?? undefined })"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.licensePlate.confidence" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.plate_confidence')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.licensePlate?.minLength"
            name="detectionSettings.licensePlate.minLength"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.licensePlate.minLength" class="cui-label">{{ $t('components.form.label.plate_min_length') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.licensePlate?.minLength"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="1"
                :min="1"
                :max="10"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.licensePlate = { ...cameraForm.detectionSettings.licensePlate, minLength: e ?? undefined })"
                @input="(e) => (cameraForm.detectionSettings.licensePlate = { ...cameraForm.detectionSettings.licensePlate, minLength: (e.value as any) ?? undefined })"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.licensePlate.minLength" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.plate_min_length')
            }}</Message>
          </Field>

          <span class="section-title mt-2">{{ $t('components.camera_options.sensors') }}</span>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.sensor?.timeout"
            name="detectionSettings.sensor.timeout"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.sensor.timeout" class="cui-label">{{ $t('components.form.label.sensor_timeout') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.sensor?.timeout"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :min="10"
                :use-grouping="false"
                @value-change="
                  (e) => {
                    if (!cameraForm.detectionSettings.sensor) cameraForm.detectionSettings.sensor = { timeout: 30, triggers: [] };
                    cameraForm.detectionSettings.sensor.timeout = e ?? 30;
                  }
                "
                @input="
                  (e) => {
                    if (!cameraForm.detectionSettings.sensor) cameraForm.detectionSettings.sensor = { timeout: 30, triggers: [] };
                    cameraForm.detectionSettings.sensor.timeout = (e.value as any) ?? 30;
                  }
                "
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.sensor.timeout" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.sensor_timeout')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.sensor?.triggers ?? []"
            name="detectionSettings.sensor.triggers"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.sensor.triggers" class="cui-label">{{ $t('components.form.label.sensor_triggers') }}</label>
            <MultiSelect
              :model-value="visibleSensorTriggerKeys"
              :invalid="errors.length > 0"
              :options="triggerableSensors"
              option-label="label"
              option-value="value"
              :placeholder="$t('components.form.hint.sensor_triggers_placeholder')"
              class="w-full"
              :show-toggle-all="false"
              @update:model-value="updateSensorTriggers"
            />

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.sensor.triggers" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">
              {{ $t('components.form.hint.sensor_triggers') }}
            </Message>
          </Field>
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="ptzAutotrack">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.ptz_autotrack') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="w-full flex flex-col gap-4">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.ptz_autotrack_hint') }}
          </Message>
          <Message v-if="!hasPtzCapability" severity="secondary" variant="simple" size="small" class="cui-banner cui-banner-warn">
            <i-mdi:information-outline class="w-4 h-4 shrink-0 inline-block mr-1" />
            {{ $t('components.form.hint.ptz_autotrack_requires') }}
          </Message>

          <Field
            v-slot="{ field, errors }"
            :model-value="cameraForm.ptzAutotrack?.enabled"
            :value="true"
            :unchecked-value="false"
            type="checkbox"
            name="ptzAutotrack.enabled"
            as="div"
            class="flex flex-col field-gap cui-toggle-switch"
          >
            <div class="flex items-center gap-4">
              <div class="flex flex-col field-switch-gap">
                <label for="ptzAutotrack.enabled" class="cui-label-switch">{{ $t('components.form.label.ptz_autotrack_enabled') }}</label>

                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.ptz_autotrack') }}</Message>

                <Transition name="fade">
                  <ErrorMessage name="ptzAutotrack.enabled" class="cui-input-switch-error" />
                </Transition>
              </div>
              <ToggleSwitch
                :model-value="cameraForm.ptzAutotrack?.enabled"
                v-bind="field"
                :invalid="errors.length > 0"
                :loading="isLoading"
                :disabled="!hasPtzCapability"
                class="ml-auto shrink-0"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack) cameraForm.ptzAutotrack.enabled = e;
                  }
                "
              />
            </div>
          </Field>

          <template v-if="cameraForm.ptzAutotrack?.enabled && hasPtzCapability">
            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.targetLabels" name="ptzAutotrack.targetLabels" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_target_labels') }}</label>
              <MultiSelect
                :model-value="cameraForm.ptzAutotrack?.targetLabels"
                :options="ptzAutotrackLabels"
                option-label="label"
                option-value="value"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack) cameraForm.ptzAutotrack.targetLabels = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_target_labels') }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.minConfidence" name="ptzAutotrack.minConfidence" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_min_confidence') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.minConfidence"
                :min="0.3"
                :max="1"
                :step="0.05"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.minConfidence = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_min_confidence') }}</Message>
            </Field>

            <Field
              v-slot="{ errors }"
              :model-value="cameraForm.ptzAutotrack?.triggerDeadZone"
              name="ptzAutotrack.triggerDeadZone"
              as="div"
              class="flex flex-col field-gap"
            >
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_trigger_dead_zone') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.triggerDeadZone"
                :min="0"
                :max="0.3"
                :step="0.01"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.triggerDeadZone = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.ptz_autotrack_trigger_dead_zone')
              }}</Message>
            </Field>

            <Field
              v-slot="{ errors }"
              :model-value="cameraForm.ptzAutotrack?.trackingSpeed ?? 2"
              name="ptzAutotrack.trackingSpeed"
              as="div"
              class="flex flex-col field-gap"
            >
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_tracking_speed') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.trackingSpeed ?? 2"
                :min="1"
                :max="5"
                :step="0.5"
                :min-fraction-digits="1"
                :max-fraction-digits="1"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.trackingSpeed = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_tracking_speed') }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.leadMs ?? 1800" name="ptzAutotrack.leadMs" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_lead_ms') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.leadMs ?? 1800"
                :min="0"
                :max="4000"
                :step="100"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.leadMs = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_lead_ms') }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.panRate ?? 0.85" name="ptzAutotrack.panRate" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_pan_rate') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.panRate ?? 0.85"
                :min="0.1"
                :max="3"
                :step="0.05"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.panRate = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_pan_rate') }}</Message>
            </Field>

            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.ptzAutotrack?.returnToHome"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="ptzAutotrack.returnToHome"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="ptzAutotrack.returnToHome" class="cui-label-switch">{{ $t('components.form.label.ptz_autotrack_return_home') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                    $t('components.form.hint.ptz_autotrack_return_home')
                  }}</Message>

                  <Transition name="fade">
                    <ErrorMessage name="ptzAutotrack.returnToHome" class="cui-input-switch-error" />
                  </Transition>
                </div>
                <ToggleSwitch
                  :model-value="cameraForm.ptzAutotrack?.returnToHome"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="
                    (e) => {
                      if (cameraForm.ptzAutotrack) cameraForm.ptzAutotrack.returnToHome = e;
                    }
                  "
                />
              </div>
            </Field>

            <Field
              v-if="cameraForm.ptzAutotrack?.returnToHome"
              v-slot="{ errors }"
              :model-value="cameraForm.ptzAutotrack?.homeWaitMs"
              name="ptzAutotrack.homeWaitMs"
              as="div"
              class="flex flex-col field-gap"
            >
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_home_wait') }}</label>
              <InputNumber
                :model-value="(cameraForm.ptzAutotrack?.homeWaitMs ?? 0) / 1000"
                :min="1"
                :max="60"
                :step="1"
                suffix=" s"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.homeWaitMs = e * 1000;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_home_wait') }}</Message>
            </Field>
          </template>
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="snapshot">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.snapshot') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.snapshot_hint') }}
          </Message>
          <div class="w-full flex flex-col gap-2">
            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.snapshotSettings.autoRefresh"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="snapshotSettings.autoRefresh"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="snapshotSettings.autoRefresh" class="cui-label-switch">{{ $t('components.form.label.auto_refresh') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.auto_refresh') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage name="snapshotSettings.autoRefresh" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="cameraForm.snapshotSettings.autoRefresh"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="(e) => (cameraForm.snapshotSettings.autoRefresh = e)"
                />
              </div>
            </Field>
          </div>

          <Field v-slot="{ errors }" :model-value="cameraForm.snapshotSettings.ttl" name="snapshotSettings.ttl" as="div" class="flex flex-col field-gap">
            <label for="snapshotSettings.ttl" class="cui-label">{{ $t('components.form.label.cache_time') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.snapshotSettings.ttl"
                :invalid="errors.length > 0"
                :loading="isLoading"
                :min="10"
                show-buttons
                :use-grouping="false"
                @value-change="(e) => (cameraForm.snapshotSettings.ttl = e ?? 10)"
                @input="(e) => (cameraForm.snapshotSettings.ttl = (e.value as any) ?? 10)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="snapshotSettings.ttl" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.cache_time') }}</Message>
          </Field>

          <Field v-slot="{ errors }" :model-value="cameraForm.snapshotSettings.interval" name="snapshotSettings.interval" as="div" class="flex flex-col field-gap">
            <label for="snapshotSettings.interval" class="cui-label">{{ $t('components.form.label.refresh_interval') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.snapshotSettings.interval"
                :invalid="errors.length > 0"
                :loading="isLoading"
                :min="10"
                :max="60"
                show-buttons
                :use-grouping="false"
                @value-change="(e) => (cameraForm.snapshotSettings.interval = e ?? 30)"
                @input="(e) => (cameraForm.snapshotSettings.interval = (e.value as any) ?? 30)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="snapshotSettings.interval" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.refresh_interval')
            }}</Message>
          </Field>
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="zones">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.zones') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-4">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.zones_hint') }}
          </Message>

          <div v-if="zoneEntries.length" class="flex flex-col gap-2">
            <div v-for="entry in zoneEntries" :key="`${entry.kind}-${entry.index}`" class="flex items-center gap-2 p-2 rounded-md border-color">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: entry.color }" />
              <div class="flex flex-col flex-1 min-w-0">
                <span class="text-sm font-medium truncate">{{ entry.name }}</span>
                <span class="text-xs text-muted">{{ entry.typeLabel }}</span>
              </div>
              <Button
                v-tooltip.top="$t('components.zone_editor.edit_zones')"
                text
                rounded
                severity="secondary"
                class="cui-icon-sm shrink-0"
                @click="openEditZoneEntry(entry)"
              >
                <template #icon>
                  <i-mdi:pencil width="100%" height="100%" />
                </template>
              </Button>
              <Button
                v-tooltip.top="$t('components.camera_options.zone_entry_delete')"
                text
                rounded
                severity="danger"
                class="cui-icon-sm shrink-0"
                @click="confirmDeleteZoneEntry(entry)"
              >
                <template #icon>
                  <i-mdi:trash-can-outline width="100%" height="100%" />
                </template>
              </Button>
            </div>
          </div>

          <span v-else class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.zones_empty') }}</span>

          <Button
            fluid
            class="cui-button-medium"
            :loading="isLoading"
            :label="$t('components.form.button.edit_zones')"
            @click="openEditZoneDialog(camera.detectionZones)"
          ></Button>
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="sensors">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.virtual_sensors') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-4">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.virtual_sensors_hint') }}
          </Message>

          <div v-if="cameraVirtualSensors.length" class="flex flex-col gap-2">
            <div v-for="virtualSensor in cameraVirtualSensors" :key="virtualSensor._id" class="flex items-center gap-2 p-2 rounded-md border-color">
              <div class="flex flex-col flex-1 min-w-0">
                <span class="text-sm font-medium truncate">{{ virtualSensor.displayName || virtualSensor.name }}</span>
                <span class="text-xs text-muted">{{ $t(`components.camera_options.sensor_type_${virtualSensor.type}`) }}</span>
              </div>
              <Button
                v-tooltip.top="$t('components.camera_options.sensor_display_name')"
                text
                rounded
                severity="secondary"
                class="cui-icon-sm shrink-0"
                @click="openRenameVirtualSensorDialog(virtualSensor)"
              >
                <template #icon>
                  <i-mdi:pencil width="100%" height="100%" />
                </template>
              </Button>
              <Button
                v-tooltip.top="$t('components.camera_options.virtual_sensor_delete')"
                text
                rounded
                severity="danger"
                class="cui-icon-sm shrink-0"
                @click="confirmDeleteVirtualSensor(virtualSensor)"
              >
                <template #icon>
                  <i-mdi:trash-can-outline width="100%" height="100%" />
                </template>
              </Button>
            </div>
          </div>

          <span v-else class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.virtual_sensors_empty') }}</span>

          <Button fluid class="cui-button-medium" :label="$t('components.camera_options.virtual_sensor_create')" @click="openCreateVirtualSensorDialog" />
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="frameworker">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.frame_worker') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.frame_worker_hint') }}
          </Message>
          <Field v-slot="{ errors }" :model-value="cameraForm.frameWorkerSettings.fps" name="frameWorkerSettings.fps" as="div" class="flex flex-col field-gap">
            <label for="frameWorkerSettings.fps" class="cui-label">{{ $t('components.form.label.fps') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.frameWorkerSettings.fps"
                :invalid="errors.length > 0"
                :loading="isLoading"
                :min="0"
                show-buttons
                :use-grouping="false"
                @value-change="(e) => (cameraForm.frameWorkerSettings.fps = (e as any) ?? undefined)"
                @input="(e) => (cameraForm.frameWorkerSettings.fps = (e.value as any) ?? undefined)"
              />
            </InputGroup>
            <Transition name="fade">
              <ErrorMessage name="frameWorkerSettings.fps" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.frameworker_fps')
            }}</Message>
          </Field>

          <div class="w-full flex flex-col gap-2">
            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.frameWorkerSettings.hqSnapshots"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="frameWorkerSettings.hqSnapshots"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="frameWorkerSettings.hqSnapshots" class="cui-label-switch">{{ $t('components.form.label.hq_snapshots') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.hq_snapshots') }}</Message>

                  <Transition name="fade">
                    <ErrorMessage name="frameWorkerSettings.hqSnapshots" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="cameraForm.frameWorkerSettings.hqSnapshots"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="(e) => (cameraForm.frameWorkerSettings.hqSnapshots = e)"
                />
              </div>
            </Field>
          </div>
        </div>
      </AccordionContent>
    </AccordionPanel>
  </Accordion>
</template>

<script setup lang="ts">
import { useSensors } from '@camera.ui/browser';
import { SensorType } from '@camera.ui/sdk';
import { ErrorMessage, Field } from 'vee-validate';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { VirtualSensorsQuery } from '@/api/routes/virtualsensors.js';
import AspectRatioDialog from '@/components/CuiDialog/templates/AspectRatio/AspectRatio.vue';
import CreateRoomDialog from '@/components/CuiDialog/templates/CreateRoom/CreateRoom.vue';
import RenameSensorDialog from '@/components/CuiDialog/templates/RenameSensor/RenameSensor.vue';
import VirtualSensorCreateDialog from '@/components/CuiDialog/templates/VirtualSensorCreate/VirtualSensorCreate.vue';
import ZoneEditorDialog from '@/components/CuiDialog/templates/ZoneEditor/ZoneEditor.vue';

import type { AspectRatioProps } from '@/components/CuiDialog/templates/AspectRatio/types.js';
import type { VirtualSensorCreateResult } from '@/components/CuiDialog/templates/VirtualSensorCreate/types.js';
import type { ZoneEditorProps } from '@/components/CuiDialog/templates/ZoneEditor/types.js';
import type { VideoStreamingMode } from '@camera.ui/browser';
import type { CameraAspectRatio, CameraType, DetectionZone, MotionResolution, StreamingRole } from '@camera.ui/sdk';
import type { DBCamera, DBVirtualSensor } from '@shared/types';
import type { CameraOptionsTabEmits, CameraOptionsTabProps } from '../../types.js';

const TRIGGERABLE_TYPES = new Set([
  SensorType.Contact,
  SensorType.Occupancy,
  SensorType.Smoke,
  SensorType.Leak,
  SensorType.Doorbell,
  SensorType.Switch,
  SensorType.Light,
  SensorType.Siren,
  SensorType.Lock,
  SensorType.Garage,
  SensorType.SecuritySystem,
]);

const camerasQuery = new CamerasQuery();
const camerasQueryRooms = new CamerasQuery();
const virtualSensorsQuery = new VirtualSensorsQuery();

const props = defineProps<CameraOptionsTabProps>();

const emit = defineEmits<CameraOptionsTabEmits>();

const cameraForm = defineModel<DBCamera>({
  required: true,
});

const route = useRoute();
const router = useRouter();
const dialog = useCuiDialog();
const { t } = useI18n();
const { camera, cameraDevice, loading: parentLoading } = toRefs(props);
const { sensors: allSensors } = useSensors(cameraDevice);

const { data: roomsData, isBusy: roomsLoading } = camerasQueryRooms.getRoomsQuery();
const { mutateAsync: removeCamera, isPending: removeLoading } = camerasQuery.removeCameraQuery();
const { mutateAsync: patchZones, isPending: zonesPatching } = camerasQuery.patchZonesQuery();
const { mutateAsync: patchLines, isPending: linesPatching } = camerasQuery.patchLinesQuery();
const { data: virtualSensorsData } = virtualSensorsQuery.getVirtualSensorsQuery();
const { mutateAsync: createVirtualSensor, isPending: virtualSensorCreating } = virtualSensorsQuery.createVirtualSensorQuery();
const { mutateAsync: patchVirtualSensor } = virtualSensorsQuery.patchVirtualSensorQuery();
const { mutateAsync: deleteVirtualSensor, isPending: virtualSensorDeleting } = virtualSensorsQuery.deleteVirtualSensorQuery();

const cameraTypes = ref<CameraType[]>(['camera', 'doorbell']);
const streamingModes = ref<VideoStreamingMode[]>(['auto', 'mse', 'webrtc', 'webrtc/tcp']);
const streamingSources = ref<StreamingRole[]>(['high-resolution', 'mid-resolution', 'low-resolution']);
const aspectRatios = ref<CameraAspectRatio[]>(['16:9', '9:16', '8:3', '4:3', '1:1']);
const motionResolutions = ref<MotionResolution[]>(['low', 'medium', 'high']);
const localRooms = ref<string[]>([]);

const hasPtzCapability = computed(() => allSensors.value.some((s) => s.type === SensorType.PTZ));

const cameraVirtualSensors = computed(() => (virtualSensorsData.value ?? []).filter((sensor) => sensor.cameraId === cameraForm.value._id));

const zoneEntryDeleting = computed(() => zonesPatching.value || linesPatching.value);

const zoneEntries = computed(() => [
  ...(camera.value.detectionZones ?? []).map((zone, index) => ({
    kind: 'zone' as const,
    index,
    name: zone.name,
    color: zone.color,
    typeLabel: zone.isPrivacyMask ? t('components.camera_options.zone_entry_privacy_mask') : t('components.camera_options.zone_entry_zone'),
  })),
  ...(camera.value.detectionLines ?? []).map((line, index) => ({
    kind: 'line' as const,
    index,
    name: line.name,
    color: line.color,
    typeLabel: t('components.camera_options.zone_entry_line'),
  })),
]);

const ptzAutotrackLabels = computed(() => [
  { label: t('components.automation_nodes.label_person'), value: 'person' },
  { label: t('components.automation_nodes.label_vehicle'), value: 'vehicle' },
  { label: t('components.automation_nodes.label_animal'), value: 'animal' },
  { label: t('components.automation_nodes.label_package'), value: 'package' },
]);

const triggerableSensors = computed(() =>
  allSensors.value.filter((s) => TRIGGERABLE_TYPES.has(s.type)).map((s) => ({ label: s.displayName.value, value: toSensorKey(s.type, s.name, s.pluginId) })),
);

const onlineSensorKeys = computed(() => new Set(triggerableSensors.value.map((s) => s.value)));

const visibleSensorTriggerKeys = computed(() =>
  (cameraForm.value.detectionSettings.sensor?.triggers ?? [])
    .map((ref) => toSensorKey(ref.sensorType, ref.sensorName, ref.pluginId))
    .filter((key) => onlineSensorKeys.value.has(key)),
);

const roomOptions = computed(() => {
  const apiRooms = roomsData.value ?? ['Default'];
  const seen = new Set(apiRooms.map((r) => r.toLowerCase()));
  const merged = [...apiRooms, ...localRooms.value.filter((r) => !seen.has(r.toLowerCase()))];
  return merged.map((r) => ({
    label: r === 'Default' ? t('components.form.label.room_default') : r,
    value: r,
  }));
});

const isLoading = computed(() => parentLoading.value || removeLoading.value);

// Composite key for stable sensor identification (survives plugin restarts)
function toSensorKey(sensorType: string, sensorName: string, pluginId: string) {
  return `${sensorType}::${sensorName}::${pluginId}`;
}

function updateSensorTriggers(selectedKeys: string[]) {
  const offlineRefs = (cameraForm.value.detectionSettings.sensor?.triggers ?? []).filter(
    (ref) => !onlineSensorKeys.value.has(toSensorKey(ref.sensorType, ref.sensorName, ref.pluginId)),
  );
  const selectedRefs = selectedKeys.map((key) => {
    const [sensorType, sensorName, pluginId]: [SensorType, string, string] = key.split('::') as [SensorType, string, string];
    return { sensorType, sensorName, pluginId };
  });
  if (!cameraForm.value.detectionSettings.sensor) cameraForm.value.detectionSettings.sensor = { timeout: 30, triggers: [] };
  cameraForm.value.detectionSettings.sensor.triggers = [...offlineRefs, ...selectedRefs];
}

function openCreateRoomDialog() {
  dialog.openComponentDialog<Record<string, never>>(CreateRoomDialog, {
    data: {
      title: t('components.dialog.title.create_room'),
      confirmText: t('components.form.button.add'),
      contentProps: {},
    },
    onConfirm: (name: string | null) => {
      if (!name) return;
      // Case-insensitive: use existing room if it matches
      const existing = roomOptions.value.find((r) => r.value.toLowerCase() === name.toLowerCase());
      const roomValue = existing?.value ?? name;
      if (!existing) localRooms.value.push(roomValue);
      cameraForm.value.room = roomValue;
    },
  });
}

function openCreateVirtualSensorDialog() {
  dialog.openComponentDialog<{ cameraId: string }>(VirtualSensorCreateDialog, {
    data: {
      title: t('components.camera_options.virtual_sensor_create'),
      confirmText: t('components.form.button.save'),
      loading: virtualSensorCreating,
      contentProps: {
        cameraId: cameraForm.value._id,
      },
    },
    onConfirm: async (result: VirtualSensorCreateResult | null) => {
      if (!result) return;
      await createVirtualSensor({ data: result });
    },
  });
}

function openRenameVirtualSensorDialog(sensor: DBVirtualSensor) {
  dialog.openComponentDialog<{ currentDisplayName: string }>(RenameSensorDialog, {
    data: {
      title: t('components.camera_options.sensor_display_name'),
      confirmText: t('components.form.button.save'),
      contentProps: {
        currentDisplayName: sensor.displayName || sensor.name,
      },
    },
    onConfirm: async (newName: string | null) => {
      if (newName && newName !== sensor.displayName) {
        await patchVirtualSensor({ id: sensor._id, data: { displayName: newName } });
      }
    },
  });
}

function confirmDeleteVirtualSensor(sensor: DBVirtualSensor) {
  dialog.openTextDialog({
    data: {
      title: t('components.camera_options.virtual_sensor_delete'),
      contentText: t('components.camera_options.virtual_sensor_delete_confirm'),
      confirmText: t('components.form.button.remove'),
      loading: virtualSensorDeleting,
    },
    onConfirm: async () => {
      await deleteVirtualSensor({ id: sensor._id });
    },
  });
}

function deleteCamera() {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      confirmText: t('components.form.button.remove'),
      contentText: t('components.dialog.message.confirm_remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      try {
        await removeCamera({ cameraname: camera.value.name });
        if (route.path.includes(camera.value.name)) {
          router.push({ path: '/home' });
        }

        emit('close');
      } catch {
        //
      }
    },
  });
}

function openEditZoneDialog(zones: DetectionZone[] = []) {
  dialog.openComponentDialog<ZoneEditorProps>(ZoneEditorDialog, {
    data: {
      title: t('components.zone_editor.edit_zones'),
      loading: isLoading,
      contentProps: {
        cameraName: camera.value.name,
        zones,
        lines: camera.value.detectionLines ?? [],
      },
    },
  });
}

function openAspectRatioDialog() {
  dialog.openComponentDialog<AspectRatioProps>(AspectRatioDialog, {
    data: {
      title: t('components.form.label.aspect_ratio'),
      contentProps: {
        camera: camera.value,
        current: cameraForm.value.interfaceSettings.aspectRatio,
        presets: aspectRatios.value,
      },
      confirmText: t('components.form.button.apply'),
    },
    onConfirm: (newValue: string) => {
      cameraForm.value.interfaceSettings.aspectRatio = newValue as CameraAspectRatio;
    },
  });
}

function openEditZoneEntry(entry: { kind: 'zone' | 'line'; index: number }) {
  dialog.openComponentDialog<ZoneEditorProps>(ZoneEditorDialog, {
    data: {
      title: t('components.zone_editor.edit_zones'),
      loading: isLoading,
      contentProps: {
        cameraName: camera.value.name,
        zones: camera.value.detectionZones ?? [],
        lines: camera.value.detectionLines ?? [],
        initialTab: entry.kind === 'line' ? 'lines' : 'zones',
        initialSelection: entry.index,
      },
    },
  });
}

function confirmDeleteZoneEntry(entry: { kind: 'zone' | 'line'; index: number }) {
  dialog.openTextDialog({
    data: {
      title: t('components.camera_options.zone_entry_delete'),
      contentText: t('components.camera_options.zone_entry_delete_confirm'),
      confirmText: t('components.form.button.remove'),
      loading: zoneEntryDeleting,
    },
    onConfirm: async () => {
      if (entry.kind === 'zone') {
        const zoneData = (camera.value.detectionZones ?? []).filter((_, index) => index !== entry.index);
        await patchZones({ cameraname: camera.value.name, zoneData });
      } else {
        const lineData = (camera.value.detectionLines ?? []).filter((_, index) => index !== entry.index);
        await patchLines({ cameraname: camera.value.name, lineData });
      }
    },
  });
}
</script>

<style scoped></style>
