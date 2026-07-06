<template>
  <div>
    <Form ref="formRef" :validation-schema="validationSchema" @submit="onFormSubmit">
      <div v-if="groupTabs.length" class="flex flex-col gap-6">
        <CuiChipGroup v-model="selectedGroup" mandatory>
          <CuiChip v-for="group in groupTabs" :key="group" size="small" :value="group">
            {{ group }}
          </CuiChip>
        </CuiChipGroup>

        <Tabs v-model:value="selectedGroup" scrollable class="w-full h-full">
          <TabPanels class="p-0">
            <!-- @vue-ignore -->
            <TabPanel v-for="(group, index) in groupTabs" :key="index" v-slot="slotProps" :value="group" as-child>
              <div v-show="(slotProps as any).active" :class="(slotProps as any).class" v-bind="(slotProps as any).a11yAttrs" class="flex flex-col gap-6">
                <template v-for="schema in filteredSchemas(group)" :key="schema.key">
                  <CuiSchemaField
                    v-if="showField(schema)"
                    v-show="!(schema as any).hidden"
                    v-model="formValues"
                    :schema-field="schema"
                    :config-key="schema.key"
                    :loading
                    @on-action="onAction"
                    @on-submit="onSubmit"
                  />
                </template>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <template v-for="schema in ungroupedSchemas" :key="schema.key">
          <CuiSchemaField
            v-if="showField(schema)"
            v-show="!(schema as any).hidden"
            v-model="formValues"
            :schema-field="schema"
            :config-key="schema.key"
            :loading
            @on-action="onAction"
            @on-submit="onSubmit"
          />
        </template>
      </div>

      <div v-else class="flex flex-col gap-6">
        <template v-for="schema in schemaForm.schema" :key="schema.key">
          <CuiSchemaField
            v-if="showField(schema)"
            v-show="!(schema as any).hidden"
            v-model="formValues"
            :schema-field="schema"
            :config-key="schema.key"
            :loading
            @on-action="onAction"
            @on-submit="onSubmit"
          />
        </template>
      </div>

      <Button
        v-if="(!isGroupReadonly && isGroupStorable && saveButton) || showButton"
        fluid
        class="mt-7 cui-button-medium"
        :severity="saveButtonColor"
        type="submit"
        :loading
        :disabled="disableButton"
        :label="saveButtonLabel || $t('components.form.button.save')"
      >
      </Button>
    </Form>
  </div>
</template>

<script setup lang="ts">
import {
  evaluateCondition,
  generateConfigFromSchemas,
  generateZodSchema,
  isButtonType,
  isConfigDefault,
  isStringType,
  isSubmitType,
  schemaGroupIsReadonly,
  schemaGroupIsStorable,
} from '@shared/types';
import { Form } from 'vee-validate';

import { deepToRaw } from '@/common/utils.js';

import type { JsonSchema, PluginConfig } from '@camera.ui/sdk';
import type { FormValidationResult, GenericObject } from 'vee-validate';
import type { CuiSchemaEmits, CuiSchemaProps } from './types.js';

const props = withDefaults(defineProps<CuiSchemaProps>(), {
  loading: false,
  saveButton: true,
  showButton: false,
});

const emit = defineEmits<CuiSchemaEmits>();

const { schemaForm, loading, saveButton, saveButtonLabel, showButton, disableButton, saveButtonColor } = toRefs(props);

const log = useLogger();

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const selectedGroup = ref('');
const submitFail = ref(false);
const formValues = ref<PluginConfig>({});

const validationSchema = computed(() => {
  return generateZodSchema(schemaForm.value.schema);
});

const groupTabs = computed<string[]>(() => {
  const groups: string[] = [];

  schemaForm.value.schema.forEach((schema) => {
    if ((schema as any).group && !(schema as any).hidden && !groups.includes((schema as any).group)) {
      groups.push((schema as any).group);
    }
  });

  return groups;
});

watch(
  groupTabs,
  (groups) => {
    if (groups.length) {
      if (!groups.includes(selectedGroup.value)) {
        selectedGroup.value = groups[0];
      }
    } else if (selectedGroup.value) {
      selectedGroup.value = '';
    }
  },
  { immediate: true },
);

const isGroupReadonly = computed(() => {
  return schemaGroupIsReadonly(schemaForm.value.schema, selectedGroup.value);
});

const isGroupStorable = computed(() => {
  return schemaGroupIsStorable(schemaForm.value.schema, selectedGroup.value);
});

const ungroupedSchemas = computed(() => {
  return schemaForm.value.schema.filter((schema) => {
    return !(schema as any).group && !(schema as any).hidden;
  });
});

function filteredSchemas(group: string) {
  return schemaForm.value.schema.filter((schema) => {
    return (schema as any).group === group && !(schema as any).hidden;
  });
}

function needsValidation(schema: JsonSchema): boolean {
  const qrType = isStringType(schema) && schema.format === 'qrCode';
  const imageType = isStringType(schema) && schema.format === 'image';
  const buttonType = isButtonType(schema) || isSubmitType(schema);
  return !qrType && !imageType && !buttonType;
}

function showField(schema: JsonSchema): boolean {
  if ('condition' in schema && (schema as any).condition) {
    if (!evaluateCondition((schema as any).condition, formValues.value)) {
      return false;
    }
  }
  return !(schema as any).hidden || ((schema as any).hidden && needsValidation(schema));
}

async function validate(): Promise<FormValidationResult<GenericObject, GenericObject> | undefined> {
  return await formRef.value?.validate();
}

function onAction(state: { key: string }): void {
  emit('onAction', state);
}

async function onSubmit(state: { key: string }): Promise<void> {
  const result = await validate();

  if (result?.valid && result?.values) {
    submitFail.value = false;
    emit('onSubmit', {
      key: state.key,
      payload: result.values,
    });
  } else {
    submitFail.value = true;
    log.error('result', result);
  }
}

async function onFormSubmit(): Promise<void> {
  const result = await validate();

  if (result?.valid && result?.values) {
    submitFail.value = false;
    emit('onFormSubmit', result.values);
  } else {
    submitFail.value = true;
    log.error('Form validation failed:', result);
  }
}

function reset(): void {
  formRef.value?.resetForm();
}

watch(
  [schemaForm, formRef],
  ([]) => {
    if (formRef.value) {
      if (!isConfigDefault(formRef.value.values, schemaForm.value.schema) || submitFail.value) {
        formValues.value = formRef.value.values;
      }
    }

    if (schemaForm.value.config && Object.keys(schemaForm.value.config).length) {
      formValues.value = { ...generateConfigFromSchemas(schemaForm.value.schema), ...deepToRaw(schemaForm.value.config) };
    } else {
      formValues.value = generateConfigFromSchemas(schemaForm.value.schema);
    }
  },
  { immediate: true, deep: true },
);

watch(selectedGroup, (value) => {
  if (value) {
    emit('changeGroup', value);
  }
});

defineExpose({
  reset,
  validate,
});
</script>

<style scoped></style>
