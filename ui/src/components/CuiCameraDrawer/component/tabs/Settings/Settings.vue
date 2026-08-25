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
                :model-value="cameraForm.roomId"
                :options="roomOptions"
                option-label="label"
                option-value="value"
                :option-group-label="roomsGrouped ? 'label' : undefined"
                :option-group-children="roomsGrouped ? 'items' : undefined"
                :invalid="errors.length > 0"
                :loading="roomsLoading"
                class="w-full"
                @update:model-value="(e) => (cameraForm.roomId = e)"
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
            :model-value="cameraForm.interfaceSettings.playbackSource"
            name="interfaceSettings.playbackSource"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="interfaceSettings.playbackSource" class="cui-label">{{ $t('components.form.label.playback_source') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.interfaceSettings.playbackSource ?? 'auto'"
                :options="playbackSources"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.interfaceSettings.playbackSource = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="interfaceSettings.playbackSource" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.playback_source')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.interfaceSettings.activityMode"
            name="interfaceSettings.activityMode"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="interfaceSettings.activityMode" class="cui-label">{{ $t('components.form.label.activity_mode') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.interfaceSettings.activityMode ?? 'always-on'"
                :options="activityModes"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.interfaceSettings.activityMode = e)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="interfaceSettings.activityMode" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.activity_mode')
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

          <div class="mt-2 flex items-center justify-between">
            <span class="section-chip">{{ $t('components.camera_options.sensor_type_motion') }}</span>
            <Button
              v-tooltip.left="$t('components.form.button.reset_defaults')"
              text
              rounded
              severity="secondary"
              class="cui-icon-md shrink-0"
              @click="resetDetectionSection('motion')"
            >
              <template #icon><i-mdi:restore class="w-4 h-4" /></template>
            </Button>
          </div>

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

          <div class="mt-2 flex items-center justify-between">
            <span class="section-chip">{{ $t('components.camera_options.sensor_type_object') }}</span>
            <Button
              v-tooltip.left="$t('components.form.button.reset_defaults')"
              text
              rounded
              severity="secondary"
              class="cui-icon-md shrink-0"
              @click="resetDetectionSection('object')"
            >
              <template #icon><i-mdi:restore class="w-4 h-4" /></template>
            </Button>
          </div>

          <Field
            v-for="objectLabel in OBJECT_DETECTION_LABELS"
            :key="objectLabel"
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.object.confidences[objectLabel]"
            :name="`detectionSettings.object.confidences.${objectLabel}`"
            as="div"
            class="flex flex-col field-gap"
          >
            <label :for="`detectionSettings.object.confidences.${objectLabel}`" class="cui-label">{{ $t(`components.form.label.confidence_${objectLabel}`) }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.object.confidences[objectLabel]"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.01"
                :max-fraction-digits="2"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.object.confidences[objectLabel] = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.object.confidences[objectLabel] = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage :name="`detectionSettings.object.confidences.${objectLabel}`" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t(`components.form.hint.confidence_${objectLabel}`)
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.object.timeout ?? 15"
            name="detectionSettings.object.timeout"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.object.timeout" class="cui-label">{{ $t('components.form.label.object_timeout') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.object.timeout ?? 15"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :min="10"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.object.timeout = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.object.timeout = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.object.timeout" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.object_timeout')
            }}</Message>
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

          <div class="mt-2 flex items-center justify-between">
            <span class="section-chip">{{ $t('components.camera_options.sensor_type_audio') }}</span>
            <Button
              v-tooltip.left="$t('components.form.button.reset_defaults')"
              text
              rounded
              severity="secondary"
              class="cui-icon-md shrink-0"
              @click="resetDetectionSection('audio')"
            >
              <template #icon><i-mdi:restore class="w-4 h-4" /></template>
            </Button>
          </div>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.audio.confidence"
            name="detectionSettings.audio.confidence"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.audio.confidence" class="cui-label">{{ $t('components.form.label.audio_confidence') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.audio.confidence"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.05"
                :max-fraction-digits="2"
                :min="0"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.audio.confidence = e ?? undefined)"
                @input="(e) => (cameraForm.detectionSettings.audio.confidence = (e.value as any) ?? undefined)"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.audio.confidence" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.audio_confidence')
            }}</Message>
          </Field>

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

          <div class="mt-2 flex items-center justify-between">
            <span class="section-chip">{{ $t('components.camera_options.sensor_type_face') }}</span>
            <Button
              v-tooltip.left="$t('components.form.button.reset_defaults')"
              text
              rounded
              severity="secondary"
              class="cui-icon-md shrink-0"
              @click="resetDetectionSection('face')"
            >
              <template #icon><i-mdi:restore class="w-4 h-4" /></template>
            </Button>
          </div>

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
                :max-fraction-digits="2"
                :min="0"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.face = { ...cameraForm.detectionSettings.face, confidence: e ?? undefined })"
                @input="(e) => (cameraForm.detectionSettings.face = { ...cameraForm.detectionSettings.face, confidence: (e.value as any) ?? undefined })"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.face.confidence" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.face_confidence')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.detectionSettings.face?.matchThreshold"
            name="detectionSettings.face.matchThreshold"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.face.matchThreshold" class="cui-label">{{ $t('components.form.label.face_match_threshold') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.face?.matchThreshold"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.05"
                :max-fraction-digits="2"
                :min="0.3"
                :max="0.95"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.face = { ...cameraForm.detectionSettings.face, matchThreshold: e ?? undefined })"
                @input="(e) => (cameraForm.detectionSettings.face = { ...cameraForm.detectionSettings.face, matchThreshold: (e.value as any) ?? undefined })"
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.face.matchThreshold" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.face_match_threshold')
            }}</Message>
          </Field>

          <div class="mt-2 flex items-center justify-between">
            <span class="section-chip">{{ $t('components.camera_options.sensor_type_licensePlate') }}</span>
            <Button
              v-tooltip.left="$t('components.form.button.reset_defaults')"
              text
              rounded
              severity="secondary"
              class="cui-icon-md shrink-0"
              @click="resetDetectionSection('licensePlate')"
            >
              <template #icon><i-mdi:restore class="w-4 h-4" /></template>
            </Button>
          </div>

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
                :max-fraction-digits="2"
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
            :model-value="cameraForm.detectionSettings.licensePlate?.ocrConfidence"
            name="detectionSettings.licensePlate.ocrConfidence"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="detectionSettings.licensePlate.ocrConfidence" class="cui-label">{{ $t('components.form.label.plate_ocr_confidence') }}</label>
            <InputGroup>
              <InputNumber
                :model-value="cameraForm.detectionSettings.licensePlate?.ocrConfidence"
                :invalid="errors.length > 0"
                :loading="isLoading"
                show-buttons
                :step="0.01"
                :max-fraction-digits="2"
                :min="0"
                :max="1"
                mode="decimal"
                :use-grouping="false"
                @value-change="(e) => (cameraForm.detectionSettings.licensePlate = { ...cameraForm.detectionSettings.licensePlate, ocrConfidence: e ?? undefined })"
                @input="
                  (e) => (cameraForm.detectionSettings.licensePlate = { ...cameraForm.detectionSettings.licensePlate, ocrConfidence: (e.value as any) ?? undefined })
                "
              />
            </InputGroup>

            <Transition name="fade">
              <ErrorMessage name="detectionSettings.licensePlate.ocrConfidence" class="cui-input-error" />
            </Transition>

            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.plate_ocr_confidence')
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

          <div class="mt-2 flex items-center justify-between">
            <span class="section-chip">{{ $t('components.camera_options.sensors') }}</span>
            <Button
              v-tooltip.left="$t('components.form.button.reset_defaults')"
              text
              rounded
              severity="secondary"
              class="cui-icon-md shrink-0"
              @click="resetDetectionSection('sensor')"
            >
              <template #icon><i-mdi:restore class="w-4 h-4" /></template>
            </Button>
          </div>

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

    <AccordionPanel value="recording">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.recording') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="w-full flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.recording_hint') }}
          </Message>
          <Message v-if="!hasNvrPlugin" severity="secondary" variant="simple" size="small" class="cui-banner cui-banner-warn">
            <i-mdi:information-outline class="w-4 h-4 shrink-0 inline-block mr-1" />
            {{ $t('components.camera_options.recording_requires') }}
          </Message>

          <Field
            v-slot="{ field, errors }"
            :model-value="cameraForm.recordingSettings?.enabled ?? true"
            :value="true"
            :unchecked-value="false"
            type="checkbox"
            name="recordingSettings.enabled"
            as="div"
            class="flex flex-col field-gap cui-toggle-switch"
          >
            <div class="flex items-center gap-4">
              <div class="flex flex-col field-switch-gap">
                <label for="recordingSettings.enabled" class="cui-label-switch">{{ $t('components.form.label.recording_enabled') }}</label>

                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.recording_enabled') }}</Message>

                <Transition name="fade">
                  <ErrorMessage name="recordingSettings.enabled" class="cui-input-switch-error" />
                </Transition>
              </div>
              <ToggleSwitch
                :model-value="cameraForm.recordingSettings?.enabled ?? true"
                v-bind="field"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="ml-auto shrink-0"
                @value-change="(e) => updateRecordingSettings({ enabled: e })"
              />
            </div>
          </Field>

          <template v-if="cameraForm.recordingSettings?.enabled ?? true">
            <Field v-slot="{ errors }" :model-value="cameraForm.recordingSettings?.mode" name="recordingSettings.mode" as="div" class="flex flex-col field-gap">
              <label for="recordingSettings.mode" class="cui-label">{{ $t('components.form.label.recording_mode') }}</label>
              <InputGroup>
                <Select
                  :model-value="cameraForm.recordingSettings?.mode ?? 'continuous'"
                  :options="recordingModes"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  type="text"
                  @value-change="(e) => updateRecordingSettings({ mode: e })"
                />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="recordingSettings.mode" class="cui-input-error" />
              </Transition>

              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.recording_mode')
              }}</Message>
            </Field>

            <Field
              v-if="cameraForm.recordingSettings?.mode === 'event'"
              v-slot="{ errors }"
              :model-value="cameraForm.recordingSettings?.preBuffer"
              name="recordingSettings.preBuffer"
              as="div"
              class="flex flex-col field-gap"
            >
              <label for="recordingSettings.preBuffer" class="cui-label">{{ $t('components.form.label.recording_prebuffer') }}</label>
              <InputGroup>
                <InputNumber
                  :model-value="cameraForm.recordingSettings?.preBuffer ?? 10"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  show-buttons
                  :step="1"
                  :min="0"
                  :max="60"
                  :use-grouping="false"
                  @value-change="(e) => updateRecordingSettings({ preBuffer: e ?? 10 })"
                  @input="(e) => updateRecordingSettings({ preBuffer: (e.value as any) ?? 10 })"
                />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage name="recordingSettings.preBuffer" class="cui-input-error" />
              </Transition>

              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.recording_prebuffer')
              }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.recordingSettings?.sources" name="recordingSettings.sources" as="div" class="flex flex-col field-gap">
              <label for="recordingSettings.sources" class="cui-label">{{ $t('components.form.label.recording_sources') }}</label>
              <MultiSelect
                :model-value="cameraForm.recordingSettings?.sources ?? ['high', 'mid', 'low']"
                :invalid="errors.length > 0"
                :options="recordingSources"
                class="w-full"
                :show-toggle-all="false"
                @update:model-value="(e) => updateRecordingSettings({ sources: e })"
              />

              <Transition name="fade">
                <ErrorMessage name="recordingSettings.sources" class="cui-input-error" />
              </Transition>

              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">
                {{ $t('components.form.hint.recording_sources') }}
              </Message>
            </Field>
          </template>
        </div>
      </AccordionContent>
    </AccordionPanel>

    <AccordionPanel value="notifications">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.notifications') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="w-full flex flex-col gap-6">
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
            {{ $t('components.camera_options.notifications_hint') }}
          </Message>
          <Message v-if="!hasNvrPlugin" severity="secondary" variant="simple" size="small" class="cui-banner cui-banner-warn">
            <i-mdi:information-outline class="w-4 h-4 shrink-0 inline-block mr-1" />
            {{ $t('components.camera_options.recording_requires') }}
          </Message>

          <Field
            v-slot="{ field, errors }"
            :model-value="cameraForm.notificationSettings?.enabled ?? true"
            :value="true"
            :unchecked-value="false"
            type="checkbox"
            name="notificationSettings.enabled"
            as="div"
            class="flex flex-col field-gap cui-toggle-switch"
          >
            <div class="flex items-center gap-4">
              <div class="flex flex-col field-switch-gap">
                <label for="notificationSettings.enabled" class="cui-label-switch">{{ $t('components.form.label.notify_enabled') }}</label>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.notify_enabled') }}</Message>
                <Transition name="fade">
                  <ErrorMessage name="notificationSettings.enabled" class="cui-input-switch-error" />
                </Transition>
              </div>
              <ToggleSwitch
                :model-value="cameraForm.notificationSettings?.enabled ?? true"
                v-bind="field"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="ml-auto shrink-0"
                @value-change="(e) => updateNotificationSettings({ enabled: e })"
              />
            </div>
          </Field>

          <template v-if="cameraForm.notificationSettings?.enabled ?? true">
            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.notificationSettings?.video ?? false"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="notificationSettings.video"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="notificationSettings.video" class="cui-label-switch">{{ $t('components.form.label.notify_video') }}</label>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.notify_video') }}</Message>
                  <Transition name="fade">
                    <ErrorMessage name="notificationSettings.video" class="cui-input-switch-error" />
                  </Transition>
                </div>
                <ToggleSwitch
                  :model-value="cameraForm.notificationSettings?.video ?? false"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="(e) => updateNotificationSettings({ video: e })"
                />
              </div>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.notificationSettings?.audio" name="notificationSettings.audio" as="div" class="flex flex-col field-gap">
              <label for="notificationSettings.audio" class="cui-label">{{ $t('components.form.label.notify_audio') }}</label>
              <MultiSelect
                :model-value="cameraForm.notificationSettings?.audio ?? []"
                :invalid="errors.length > 0"
                :options="notifyAudioOptions"
                :max-selected-labels="2"
                :show-toggle-all="false"
                option-label="label"
                option-value="value"
                filter
                class="w-full min-w-0"
                @update:model-value="(e) => updateNotificationSettings({ audio: e })"
              />
              <Transition name="fade">
                <ErrorMessage name="notificationSettings.audio" class="cui-input-error" />
              </Transition>
              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.notify_audio')
              }}</Message>
            </Field>

            <Field
              v-slot="{ errors }"
              :model-value="cameraForm.notificationSettings?.sensors"
              name="notificationSettings.sensors"
              as="div"
              class="flex flex-col field-gap"
            >
              <label for="notificationSettings.sensors" class="cui-label">{{ $t('components.form.label.notify_sensors') }}</label>
              <MultiSelect
                :model-value="cameraForm.notificationSettings?.sensors ?? []"
                :invalid="errors.length > 0"
                :options="notifySensorOptions"
                :max-selected-labels="2"
                :show-toggle-all="false"
                option-label="label"
                option-value="value"
                filter
                class="w-full min-w-0"
                @update:model-value="(e) => updateNotificationSettings({ sensors: e })"
              />
              <Transition name="fade">
                <ErrorMessage name="notificationSettings.sensors" class="cui-input-error" />
              </Transition>
              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.notify_sensors')
              }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.notificationSettings?.speed" name="notificationSettings.speed" as="div" class="flex flex-col field-gap">
              <label for="notificationSettings.speed" class="cui-label">{{ $t('components.form.label.notify_speed') }}</label>
              <InputGroup>
                <Select
                  :model-value="cameraForm.notificationSettings?.speed ?? 'balanced'"
                  :options="notifySpeeds"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  type="text"
                  @value-change="(e) => updateNotificationSettings({ speed: e })"
                />
              </InputGroup>
              <Transition name="fade">
                <ErrorMessage name="notificationSettings.speed" class="cui-input-error" />
              </Transition>
              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.notify_speed')
              }}</Message>
            </Field>

            <Field
              v-slot="{ errors }"
              :model-value="cameraForm.notificationSettings?.cooldown"
              name="notificationSettings.cooldown"
              as="div"
              class="flex flex-col field-gap"
            >
              <label for="notificationSettings.cooldown" class="cui-label">{{ $t('components.form.label.notify_cooldown') }}</label>
              <InputGroup>
                <InputNumber
                  :model-value="cameraForm.notificationSettings?.cooldown ?? 30"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  show-buttons
                  :step="5"
                  :min="0"
                  :max="600"
                  :use-grouping="false"
                  @value-change="(e) => updateNotificationSettings({ cooldown: e ?? 30 })"
                  @input="(e) => updateNotificationSettings({ cooldown: (e.value as any) ?? 30 })"
                />
              </InputGroup>
              <Transition name="fade">
                <ErrorMessage name="notificationSettings.cooldown" class="cui-input-error" />
              </Transition>
              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.notify_cooldown')
              }}</Message>
            </Field>
          </template>
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
                class="ml-auto shrink-0"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack) cameraForm.ptzAutotrack.enabled = e;
                  }
                "
              />
            </div>
          </Field>

          <template v-if="cameraForm.ptzAutotrack?.enabled">
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

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.minTargetSize" name="ptzAutotrack.minTargetSize" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_min_target_size') }}</label>
              <InputNumber
                :model-value="Math.round((cameraForm.ptzAutotrack?.minTargetSize ?? 0) * 100)"
                :min="0"
                :max="50"
                :step="1"
                suffix=" %"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.minTargetSize = e / 100;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_min_target_size') }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.maxTargetSize" name="ptzAutotrack.maxTargetSize" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_max_target_size') }}</label>
              <InputNumber
                :model-value="Math.round((cameraForm.ptzAutotrack?.maxTargetSize ?? 0) * 100)"
                :min="0"
                :max="100"
                :step="1"
                suffix=" %"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.maxTargetSize = e / 100;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_max_target_size') }}</Message>
            </Field>

            <Field :model-value="cameraForm.ptzAutotrack?.activeHours" name="ptzAutotrack.activeHours" as="div" class="flex flex-col field-gap">
              <div class="flex flex-row items-center gap-3">
                <div class="flex flex-col">
                  <label class="cui-label-switch">{{ $t('components.form.label.ptz_autotrack_active_hours') }}</label>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                    $t('components.form.hint.ptz_autotrack_active_hours')
                  }}</Message>
                </div>
                <ToggleSwitch :model-value="ptzActiveHoursEnabled" :loading="isLoading" class="ml-auto shrink-0" @value-change="togglePtzActiveHours" />
              </div>

              <div v-if="ptzActiveHoursEnabled" class="flex flex-row items-center gap-2">
                <DatePicker
                  :model-value="ptzActiveHoursTime('from')"
                  time-only
                  fluid
                  :loading="isLoading"
                  @update:model-value="(e) => setPtzActiveHours('from', e as Date | null)"
                />
                <span class="cui-input-hint shrink-0">{{ $t('components.form.label.until') }}</span>
                <DatePicker
                  :model-value="ptzActiveHoursTime('to')"
                  time-only
                  fluid
                  :loading="isLoading"
                  @update:model-value="(e) => setPtzActiveHours('to', e as Date | null)"
                />
              </div>
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

          <Button fluid class="cui-button-medium" :loading="isLoading" :label="$t('components.form.button.edit_zones')" @click="openEditZoneDialog()"></Button>
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
          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.frameWorkerSettings.decoder?.hardware ?? 'auto'"
            name="frameWorkerSettings.decoder.hardware"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="frameWorkerSettings.decoder.hardware" class="cui-label">{{ $t('components.form.label.decoder_hardware') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.frameWorkerSettings.decoder?.hardware ?? 'auto'"
                :options="decoderHardwareOptions"
                option-label="label"
                option-value="value"
                :invalid="errors.length > 0"
                :loading="isLoading"
                @update:model-value="(e) => setDecoderHardware(e)"
              />
            </InputGroup>
            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.decoder_hardware')
            }}</Message>
          </Field>

          <Field
            v-if="decoderDeviceVisible"
            v-slot="{ errors }"
            :model-value="cameraForm.frameWorkerSettings.decoder?.device ?? ''"
            name="frameWorkerSettings.decoder.device"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="frameWorkerSettings.decoder.device" class="cui-label">{{ $t('components.form.label.decoder_device') }}</label>
            <InputGroup>
              <InputText
                :model-value="cameraForm.frameWorkerSettings.decoder?.device ?? ''"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @update:model-value="(e) => setDecoderDevice(e ?? '')"
              />
            </InputGroup>
            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.decoder_device')
            }}</Message>
          </Field>

          <Field
            v-slot="{ errors }"
            :model-value="cameraForm.frameWorkerSettings.workerDecoder ?? null"
            name="frameWorkerSettings.workerDecoder"
            as="div"
            class="flex flex-col field-gap"
          >
            <label for="frameWorkerSettings.workerDecoder" class="cui-label">{{ $t('components.form.label.worker_decoder_hardware') }}</label>
            <InputGroup>
              <Select
                :model-value="cameraForm.frameWorkerSettings.workerDecoder?.hardware ?? 'inherit'"
                :options="workerDecoderHardwareOptions"
                option-label="label"
                option-value="value"
                :invalid="errors.length > 0"
                :loading="isLoading"
                @update:model-value="(e) => setWorkerDecoderHardware(e)"
              />
            </InputGroup>
            <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
              $t('components.form.hint.worker_decoder_hardware')
            }}</Message>

            <template v-if="workerDecoderDeviceVisible">
              <label for="frameWorkerSettings.workerDecoder.device" class="cui-label">{{ $t('components.form.label.worker_decoder_device') }}</label>
              <InputGroup>
                <InputText
                  :model-value="cameraForm.frameWorkerSettings.workerDecoder?.device ?? ''"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  type="text"
                  @update:model-value="(e) => setWorkerDecoderDevice(e ?? '')"
                />
              </InputGroup>
              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.decoder_device')
              }}</Message>
            </template>
          </Field>

          <div class="w-full flex flex-col gap-2">
            <Field
              v-slot="{ field, errors }"
              :model-value="cameraForm.frameWorkerSettings.mainStreamAnalysis"
              :value="true"
              :unchecked-value="false"
              type="checkbox"
              name="frameWorkerSettings.mainStreamAnalysis"
              as="div"
              class="flex flex-col field-gap cui-toggle-switch"
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="frameWorkerSettings.mainStreamAnalysis" class="cui-label-switch">{{ $t('components.form.label.main_stream_analysis') }}</label>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                    $t('components.form.hint.main_stream_analysis')
                  }}</Message>

                  <Transition name="fade">
                    <ErrorMessage name="frameWorkerSettings.mainStreamAnalysis" class="cui-input-switch-error" />
                  </Transition>
                </div>

                <ToggleSwitch
                  :model-value="cameraForm.frameWorkerSettings.mainStreamAnalysis"
                  v-bind="field"
                  :invalid="errors.length > 0"
                  :loading="isLoading"
                  class="ml-auto shrink-0"
                  @value-change="(e) => (cameraForm.frameWorkerSettings.mainStreamAnalysis = e)"
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
import { BASE_AUDIO_LABELS, OBJECT_DETECTION_LABELS, PluginInterface, SensorType } from '@camera.ui/sdk';
import { ErrorMessage, Field } from 'vee-validate';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { RoomsQuery } from '@/api/routes/rooms.js';
import { audioLabelKey, NOTIFY_SENSOR_TYPES, sensorLabelKey } from '@/common/eventLabels.js';
import { buildRoomOptions } from '@/components/CuiCameraDetailsFields/rooms.js';
import AspectRatioDialog from '@/components/CuiDialog/templates/AspectRatio/AspectRatio.vue';
import CreateRoomDialog from '@/components/CuiDialog/templates/CreateRoom/CreateRoom.vue';
import ZoneEditorDialog from '@/components/CuiDialog/templates/ZoneEditor/ZoneEditor.vue';

import type { AspectRatioProps } from '@/components/CuiDialog/templates/AspectRatio/types.js';
import type { ZoneEditorProps } from '@/components/CuiDialog/templates/ZoneEditor/types.js';
import type { VideoStreamingMode } from '@camera.ui/browser';
import type {
  CameraActivityMode,
  CameraAspectRatio,
  CameraNotificationSettings,
  CameraRecordingSettings,
  CameraType,
  FrameWorkerDecoderHardware,
  MotionResolution,
  NotificationSpeed,
  PlaybackSource,
  RecordingMode,
  RecordingSource,
  StreamingRole,
} from '@camera.ui/sdk';
import { defaultCameraSettings, SENSOR_TYPE_CONFIG } from '@shared/types';

import type { DBCamera } from '@shared/types';
import type { CameraOptionsTabEmits, CameraOptionsTabProps, ZoneEntry } from '../../types.js';

const TRIGGERABLE_TYPES = new Set(
  Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([, meta]) => meta.cascadeTrigger && !meta.isDetectionType)
    .map(([type]) => type as SensorType),
);

const camerasQuery = new CamerasQuery();
const roomsQuery = new RoomsQuery();

const props = defineProps<CameraOptionsTabProps>();

const emit = defineEmits<CameraOptionsTabEmits>();

const cameraForm = defineModel<DBCamera>({
  required: true,
});

const defaultDetectionSettings = defaultCameraSettings().detectionSettings;

function resetDetectionSection<K extends keyof typeof defaultDetectionSettings>(section: K): void {
  cameraForm.value.detectionSettings[section] = structuredClone(defaultDetectionSettings[section]);
}

const route = useRoute();
const router = useRouter();
const dialog = useCuiDialog();
const { t } = useI18n();
const { camera, cameraDevice, loading: parentLoading } = toRefs(props);
const { sensors: allSensors } = useSensors(cameraDevice);

const { data: roomCatalog, isBusy: roomsLoading } = roomsQuery.getRoomsQuery();
const { mutateAsync: createRoom } = roomsQuery.createRoomMutation();
const { data: cameraExtensions } = camerasQuery.getCameraExtensionsQuery(cameraForm.value.name);
const { mutateAsync: removeCamera, isPending: removeLoading } = camerasQuery.removeCameraQuery();
const { mutateAsync: patchZoneConfig, isPending: zoneConfigPatching } = camerasQuery.patchZoneConfigQuery();

const cameraTypes = ref<CameraType[]>(['camera', 'doorbell']);
const streamingModes = ref<VideoStreamingMode[]>(['auto', 'mse', 'webrtc', 'webrtc/tcp']);
const streamingSources = ref<StreamingRole[]>(['high-resolution', 'mid-resolution', 'low-resolution']);
const playbackSources = ref<PlaybackSource[]>(['auto', 'high', 'mid', 'low']);
const activityModes = ref<CameraActivityMode[]>(['always-on', 'activity', 'standby']);
const aspectRatios = ref<CameraAspectRatio[]>(['16:9', '9:16', '8:3', '4:3', '1:1']);
const motionResolutions = ref<MotionResolution[]>(['low', 'medium', 'high']);
const recordingModes = ref<RecordingMode[]>(['continuous', 'event', 'adhoc']);
const recordingSources = ref<RecordingSource[]>(['high', 'mid', 'low']);
const notifySpeeds = ref<NotificationSpeed[]>(['immediate', 'balanced', 'best']);

const notifyAudioOptions = computed(() => [
  ...BASE_AUDIO_LABELS.filter((label) => label !== 'doorbell').map((label) => ({ label: t(audioLabelKey(label)), value: label as string })),
  { label: t('components.camera_options.notify_audio_other'), value: 'other' },
]);

const notifySensorOptions = computed(() => NOTIFY_SENSOR_TYPES.map((type) => ({ label: t(sensorLabelKey(type)), value: type })));

const decoderHardwareOptions: { label: string; value: FrameWorkerDecoderHardware }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'CPU (Software)', value: 'cpu' },
  { label: 'CUDA (NVIDIA)', value: 'cuda' },
  { label: 'VAAPI (Intel/AMD)', value: 'vaapi' },
  { label: 'Quick Sync (Intel)', value: 'qsv' },
  { label: 'VideoToolbox (macOS)', value: 'videotoolbox' },
  { label: 'D3D11VA (Windows)', value: 'd3d11va' },
  { label: 'D3D12VA (Windows)', value: 'd3d12va' },
  { label: 'DXVA2 (Windows)', value: 'dxva2' },
  { label: 'Vulkan', value: 'vulkan' },
  { label: 'OpenCL', value: 'opencl' },
  { label: 'DRM', value: 'drm' },
  { label: 'RKMPP (Rockchip)', value: 'rkmpp' },
];

const ZONE_EDITOR_DIALOG_SIZE = { desktop: { maxWidth: '1280px', width: '85vw' } };

const hasPtzCapability = computed(() => allSensors.value.some((s) => s.type === SensorType.PTZ));

const decoderDeviceVisible = computed(() => {
  const hardware = cameraForm.value.frameWorkerSettings.decoder?.hardware;
  return !!hardware && hardware !== 'auto' && hardware !== 'cpu';
});

const workerDecoderHardwareOptions = computed(() => [{ label: t('components.form.label.decoder_same_as_server'), value: 'inherit' as const }, ...decoderHardwareOptions]);

const workerDecoderDeviceVisible = computed(() => {
  const hardware = cameraForm.value.frameWorkerSettings.workerDecoder?.hardware;
  return !!hardware && hardware !== 'auto' && hardware !== 'cpu';
});

const hasNvrPlugin = computed(() => (cameraExtensions.value ?? []).some((p) => p.contract.interfaces?.includes(PluginInterface.NVR)));

const zoneEntryDeleting = computed(() => zoneConfigPatching.value);

const cameraZones = computed(() => camera.value.zones ?? { motion: [], object: [], privacy: [], alert: [], lines: [] });

const zoneEntries = computed<ZoneEntry[]>(() => [
  ...cameraZones.value.motion.map((zone, index) => ({
    kind: 'motion' as const,
    index,
    name: zone.name,
    color: zone.color,
    typeLabel: t('components.camera_options.zone_entry_motion'),
  })),
  ...cameraZones.value.object.map((zone, index) => ({
    kind: 'object' as const,
    index,
    name: zone.name,
    color: zone.color,
    typeLabel: t('components.camera_options.zone_entry_object'),
  })),
  ...cameraZones.value.alert.map((zone, index) => ({
    kind: 'alert' as const,
    index,
    name: zone.name,
    color: zone.color,
    typeLabel: t('components.camera_options.zone_entry_alert'),
  })),
  ...cameraZones.value.privacy.map((zone, index) => ({
    kind: 'privacy' as const,
    index,
    name: zone.name,
    color: '#333333',
    typeLabel: t('components.camera_options.zone_entry_privacy'),
  })),
  ...cameraZones.value.lines.map((line, index) => ({
    kind: 'lines' as const,
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
]);

const ptzActiveHoursEnabled = computed(() => Boolean(cameraForm.value.ptzAutotrack?.activeHours));

function ptzActiveHoursTime(key: 'from' | 'to'): Date | null {
  const value = cameraForm.value.ptzAutotrack?.activeHours?.[key];
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function togglePtzActiveHours(enabled: boolean): void {
  const autotrack = cameraForm.value.ptzAutotrack;
  if (!autotrack) return;
  autotrack.activeHours = enabled ? { from: '22:00', to: '06:00', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined;
}

function setPtzActiveHours(key: 'from' | 'to', date: Date | null): void {
  const autotrack = cameraForm.value.ptzAutotrack;
  const hours = autotrack?.activeHours;
  if (!autotrack || !hours || !date) return;
  autotrack.activeHours = {
    ...hours,
    [key]: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

const triggerableSensors = computed(() => allSensors.value.filter((s) => TRIGGERABLE_TYPES.has(s.type)).map((s) => ({ label: s.displayName.value, value: s.id })));

const onlineSensorIds = computed(() => new Set(triggerableSensors.value.map((s) => s.value)));

const visibleSensorTriggerKeys = computed(() => (cameraForm.value.detectionSettings.sensor?.triggers ?? []).filter((sensorId) => onlineSensorIds.value.has(sensorId)));

const roomsGrouped = computed(() => (roomCatalog.value?.levels.length ?? 0) > 0);

const roomOptions = computed(() => buildRoomOptions(roomCatalog.value, t));

const isLoading = computed(() => parentLoading.value || removeLoading.value);

function setDecoderHardware(hardware: FrameWorkerDecoderHardware) {
  const device = hardware === 'auto' || hardware === 'cpu' ? '' : (cameraForm.value.frameWorkerSettings.decoder?.device ?? '');
  cameraForm.value.frameWorkerSettings.decoder = { hardware, device };
}

function setDecoderDevice(device: string) {
  const hardware = cameraForm.value.frameWorkerSettings.decoder?.hardware ?? 'auto';
  cameraForm.value.frameWorkerSettings.decoder = { hardware, device };
}

function setWorkerDecoderHardware(hardware: FrameWorkerDecoderHardware | 'inherit') {
  if (hardware === 'inherit') {
    cameraForm.value.frameWorkerSettings.workerDecoder = undefined;
    return;
  }
  const device = hardware === 'auto' || hardware === 'cpu' ? '' : (cameraForm.value.frameWorkerSettings.workerDecoder?.device ?? '');
  cameraForm.value.frameWorkerSettings.workerDecoder = { hardware, device };
}

function setWorkerDecoderDevice(device: string) {
  const hardware = cameraForm.value.frameWorkerSettings.workerDecoder?.hardware ?? 'auto';
  cameraForm.value.frameWorkerSettings.workerDecoder = { hardware, device };
}

function updateNotificationSettings(patch: Partial<CameraNotificationSettings>) {
  const current: CameraNotificationSettings = cameraForm.value.notificationSettings ?? {
    enabled: true,
    video: false,
    audio: [],
    sensors: [],
    cooldown: 30,
    speed: 'balanced',
  };
  cameraForm.value.notificationSettings = { ...current, ...patch };
}

function updateRecordingSettings(patch: Partial<CameraRecordingSettings>) {
  const current: CameraRecordingSettings = cameraForm.value.recordingSettings ?? { enabled: true, mode: 'continuous', preBuffer: 10, sources: ['high', 'mid', 'low'] };
  cameraForm.value.recordingSettings = { ...current, ...patch };
}

function updateSensorTriggers(selectedIds: string[]) {
  const offlineIds = (cameraForm.value.detectionSettings.sensor?.triggers ?? []).filter((sensorId) => !onlineSensorIds.value.has(sensorId));
  if (!cameraForm.value.detectionSettings.sensor) cameraForm.value.detectionSettings.sensor = { timeout: 30, triggers: [] };
  cameraForm.value.detectionSettings.sensor.triggers = [...offlineIds, ...selectedIds];
}

function openCreateRoomDialog() {
  dialog.openComponentDialog<Record<string, never>>(CreateRoomDialog, {
    data: {
      title: t('components.dialog.title.create_room'),
      confirmText: t('components.form.button.add'),
      contentProps: {},
    },
    onConfirm: async (name: string | null) => {
      if (!name) return;
      const room = await createRoom({ name, levelId: null, outdoor: false, publicSpace: false, note: '' });
      cameraForm.value.roomId = room.id;
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

function openEditZoneDialog() {
  dialog.openComponentDialog<ZoneEditorProps>(ZoneEditorDialog, {
    data: {
      title: t('components.zone_editor.edit_zones'),
      loading: isLoading,
      contentProps: {
        cameraName: camera.value.name,
        zones: cameraZones.value,
      },
    },
    dialogSize: ZONE_EDITOR_DIALOG_SIZE,
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

function openEditZoneEntry(entry: ZoneEntry) {
  dialog.openComponentDialog<ZoneEditorProps>(ZoneEditorDialog, {
    data: {
      title: t('components.zone_editor.edit_zones'),
      loading: isLoading,
      contentProps: {
        cameraName: camera.value.name,
        zones: cameraZones.value,
        initialTab: entry.kind,
        initialSelection: entry.index,
      },
    },
    dialogSize: ZONE_EDITOR_DIALOG_SIZE,
  });
}

function confirmDeleteZoneEntry(entry: ZoneEntry) {
  dialog.openTextDialog({
    data: {
      title: t('components.camera_options.zone_entry_delete'),
      contentText: t('components.camera_options.zone_entry_delete_confirm'),
      confirmText: t('components.form.button.remove'),
      loading: zoneEntryDeleting,
    },
    onConfirm: async () => {
      const zones = { ...cameraZones.value, [entry.kind]: cameraZones.value[entry.kind].filter((_, index) => index !== entry.index) };
      await patchZoneConfig({ cameraname: camera.value.name, zones });
    },
  });
}
</script>

<style scoped></style>
