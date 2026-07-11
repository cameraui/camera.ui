<template>
  <Form ref="formRef" class="flex flex-col gap-4 w-full" :validation-schema="validationSchema">
    <Field v-slot="{ errors }" :model-value="type" name="type" as="div" class="flex flex-col field-gap">
      <label for="virtualSensorType" class="cui-label">{{ $t('components.form.label.type') }}</label>
      <Select
        id="virtualSensorType"
        :model-value="type"
        :options="typeOptions"
        option-label="label"
        option-value="value"
        :invalid="errors.length > 0"
        class="w-full"
        @value-change="(e) => (type = e)"
      />

      <Transition name="fade">
        <ErrorMessage name="type" class="cui-input-error" />
      </Transition>
    </Field>

    <Field v-slot="{ field, errors }" v-model.trim="name" name="name" as="div" class="flex flex-col field-gap">
      <label for="virtualSensorName" class="cui-label">{{ $t('components.form.label.name') }}</label>
      <InputText
        id="virtualSensorName"
        v-bind="field"
        :invalid="errors.length > 0"
        class="w-full"
        :placeholder="$t('components.camera_options.virtual_sensor_name_placeholder')"
      />

      <Transition name="fade">
        <ErrorMessage name="name" class="cui-input-error" />
      </Transition>
    </Field>
  </Form>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';

import { createVirtualSensorSchema, VIRTUAL_SENSOR_TYPES } from '@shared/types';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { VirtualSensorType } from '@shared/types';
import type { VirtualSensorCreateProps, VirtualSensorCreateResult } from './types.js';

const props = defineProps<VirtualSensorCreateProps>();

const { t } = useI18n();
const toast = useCuiToast();

const validationSchema = createVirtualSensorSchema.omit({ cameraId: true });

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const type = ref<VirtualSensorType>(VIRTUAL_SENSOR_TYPES[0]);
const name = ref('');

const typeOptions = computed(() => VIRTUAL_SENSOR_TYPES.map((sensorType) => ({ label: t(`components.camera_options.sensor_type_${sensorType}`), value: sensorType })));

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<VirtualSensorCreateResult | null> => {
    const result = await formRef.value?.validate();

    if (!result?.valid) {
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }

    return { cameraId: props.cameraId, type: type.value, name: name.value.trim() };
  },
});
</script>
