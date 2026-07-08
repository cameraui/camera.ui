<template>
  <Accordion multiple class="p-4">
    <AccordionPanel value="general">
      <AccordionHeader class="px-0 pt-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.general') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
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
              <Select
                :model-value="cameraForm.interfaceSettings.aspectRatio"
                :options="aspectRatios"
                :invalid="errors.length > 0"
                :loading="isLoading"
                type="text"
                @value-change="(e) => (cameraForm.interfaceSettings.aspectRatio = e)"
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

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.trackingSpeed" name="ptzAutotrack.trackingSpeed" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_tracking_speed') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.trackingSpeed"
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

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.leadFrames" name="ptzAutotrack.leadFrames" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_lead_frames') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.leadFrames"
                :min="0"
                :max="6"
                :step="1"
                :invalid="errors.length > 0"
                :loading="isLoading"
                class="w-full"
                @value-change="
                  (e) => {
                    if (cameraForm.ptzAutotrack && e != null) cameraForm.ptzAutotrack.leadFrames = e;
                  }
                "
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.ptz_autotrack_lead_frames') }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="cameraForm.ptzAutotrack?.panRate" name="ptzAutotrack.panRate" as="div" class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('components.form.label.ptz_autotrack_pan_rate') }}</label>
              <InputNumber
                :model-value="cameraForm.ptzAutotrack?.panRate"
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

    <AccordionPanel value="zones">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.zones') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6 w-full items-center justify-center">
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

    <AccordionPanel value="snapshot">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.snapshot') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
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

    <AccordionPanel value="frameworker">
      <AccordionHeader class="px-0">
        <span class="text-color font-normal">{{ $t('components.camera_options.frame_worker') }}</span>
      </AccordionHeader>
      <AccordionContent :pt="{ content: { class: 'px-0' } }">
        <div class="flex flex-col gap-6">
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
import CreateRoomDialog from '@/components/CuiDialog/templates/CreateRoom/CreateRoom.vue';
import ZoneEditorDialog from '@/components/CuiDialog/templates/ZoneEditor/ZoneEditor.vue';

import type { ZoneEditorProps } from '@/components/CuiDialog/templates/ZoneEditor/types.js';
import type { VideoStreamingMode } from '@camera.ui/browser';
import type { CameraAspectRatio, CameraType, DetectionZone, MotionResolution, StreamingRole } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
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

const cameraTypes = ref<CameraType[]>(['camera', 'doorbell']);
const streamingModes = ref<VideoStreamingMode[]>(['auto', 'mse', 'webrtc', 'webrtc/tcp']);
const streamingSources = ref<StreamingRole[]>(['high-resolution', 'mid-resolution', 'low-resolution']);
const aspectRatios = ref<CameraAspectRatio[]>(['16:9', '9:16', '8:3', '4:3', '1:1']);
const motionResolutions = ref<MotionResolution[]>(['low', 'medium', 'high']);
const localRooms = ref<string[]>([]);

const hasPtzCapability = computed(() => allSensors.value.some((s) => s.type === SensorType.PTZ));

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
</script>

<style scoped></style>
