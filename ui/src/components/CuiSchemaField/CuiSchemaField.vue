<template>
  <div>
    <template v-if="isStringType(schemaField) && schemaField.format === 'qrCode'">
      <div class="flex flex-col field-gap">
        <label :for="configKey" class="cui-label">{{ schemaField.title }}</label>
        <CuiImage :src="qrCode" class="mb-3" image-container-class="w-full h-full" />
      </div>
    </template>

    <template v-if="isStringType(schemaField) && schemaField.format === 'image'">
      <div class="flex flex-col field-gap">
        <label :for="configKey" class="cui-label">{{ schemaField.title }}</label>
        <CuiImage :src="imageSrc" class="mb-3" image-container-class="w-full h-full" />
      </div>
    </template>

    <template v-else-if="isValidableStringType(schemaField)">
      <Field v-slot="{ field, errors }" v-model.trim="fieldValue" :name="configKey" as="div" class="flex flex-col field-gap">
        <label :for="configKey" class="cui-label">{{ schemaField.title }}</label>
        <InputGroup>
          <InputText
            v-if="schemaField.format !== 'password'"
            v-bind="field"
            :invalid="errors.length > 0"
            :readonly="schemaField.readonly"
            :placeholder="schemaField.placeholder"
            :loading
            type="text"
          />

          <Password v-else :model-value="fieldValue" :invalid="errors.length > 0" :readonly="schemaField.readonly" v-bind="field" :feedback="false" toggle-mask />

          <InputGroupAddon v-if="arrayItem">
            <Button text severity="secondary" :loading @click="removeArrayItem(arrayItem.key, arrayItem.index)">
              <template #icon>
                <i-mdi:close />
              </template>
            </Button>
          </InputGroupAddon>
        </InputGroup>

        <Transition name="fade">
          <ErrorMessage :name="configKey" class="cui-input-error" />
        </Transition>

        <Message v-if="!errors.length && schemaField.description" severity="secondary" variant="simple" size="small" class="cui-input-hint">
          {{ schemaField.description }}
        </Message>
      </Field>
    </template>

    <template v-else-if="isNumberType(schemaField)">
      <Field v-slot="{ field, errors }" :model-value="fieldValue" :name="configKey" as="div" class="flex flex-col field-gap">
        <label :for="configKey" class="cui-label">{{ schemaField.title }}</label>
        <InputGroup>
          <InputNumber
            v-bind="field"
            v-model="fieldValue"
            :invalid="errors.length > 0"
            :readonly="schemaField.readonly"
            :step="schemaField.step || 1"
            :min="schemaField.minimum"
            :max="schemaField.maximum"
            :use-grouping="false"
            :loading
            @value-change="(e) => (fieldValue = e ?? undefined)"
            @input="(e) => (fieldValue = (e.value as any) ?? undefined)"
          />

          <InputGroupAddon v-if="arrayItem">
            <Button text rounded severity="danger" :loading @click="removeArrayItem(arrayItem.key, arrayItem.index)">
              <template #icon>
                <i-mdi:close />
              </template>
            </Button>
          </InputGroupAddon>
        </InputGroup>

        <Transition name="fade">
          <ErrorMessage :name="configKey" class="cui-input-error" />
        </Transition>

        <Message v-if="!errors.length && schemaField.description" severity="secondary" variant="simple" size="small" class="cui-input-hint">
          {{ schemaField.description }}
        </Message>
      </Field>
    </template>

    <template v-else-if="isBooleanType(schemaField)">
      <Field
        v-slot="{ field, errors }"
        :model-value="fieldValue"
        :value="true"
        :unchecked-value="false"
        type="checkbox"
        :name="configKey"
        as="div"
        class="flex flex-col field-gap cui-toggle-switch"
      >
        <div class="flex items-center gap-4">
          <div class="flex flex-col field-switch-gap">
            <label :for="configKey" class="cui-label-switch">{{ schemaField.title }}</label>

            <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
              {{ schemaField.description }}
            </Message>

            <Transition name="fade">
              <ErrorMessage :name="configKey" class="cui-input-switch-error" />
            </Transition>
          </div>

          <ToggleSwitch :model-value="fieldValue" v-bind="field" :invalid="errors.length > 0" :loading class="ml-auto shrink-0" @value-change="(e) => (fieldValue = e)" />
        </div>
      </Field>
    </template>

    <template v-else-if="isEnumType(schemaField)">
      <Field v-slot="{ field, errors }" :model-value="fieldValue" :name="configKey" as="div" class="flex flex-col field-gap">
        <label :for="configKey" class="cui-label">{{ schemaField.title }}</label>
        <InputGroup>
          <Select
            v-if="!schemaField.multiple"
            v-bind="field"
            :model-value="fieldValue"
            :options="schemaField.enum"
            :invalid="errors.length > 0"
            :disabled="schemaField.readonly"
            :placeholder="schemaField.placeholder"
            :loading
            @value-change="(e) => (fieldValue = e)"
          />

          <MultiSelect
            v-else
            v-bind="field"
            :model-value="fieldValue"
            :options="schemaField.enum"
            :invalid="errors.length > 0"
            :disabled="schemaField.readonly"
            :placeholder="schemaField.placeholder"
            :show-clear="!schemaField.required && !schemaField.readonly"
            :show-toggle-all="false"
            :max-selected-labels="3"
            :loading
            @value-change="(e) => (fieldValue = e)"
          />

          <InputGroupAddon v-if="arrayItem">
            <Button text rounded severity="danger" :loading @click="removeArrayItem(arrayItem.key, arrayItem.index)">
              <template #icon>
                <i-mdi:close />
              </template>
            </Button>
          </InputGroupAddon>
        </InputGroup>

        <Transition name="fade">
          <ErrorMessage :name="configKey" class="cui-input-error" />
        </Transition>

        <Message v-if="!errors.length && schemaField.description" severity="secondary" variant="simple" size="small" class="cui-input-hint">
          {{ schemaField.description }}
        </Message>
      </Field>
    </template>

    <template v-else-if="isButtonType(schemaField)">
      <Button
        fluid
        class="mt-3 mb-1 cui-button-medium"
        :severity="schemaField.color"
        :loading
        :label="schemaField.title"
        @click.prevent="emit('onAction', { key: configKey })"
      >
      </Button>
      <Message v-if="schemaField.description" severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ schemaField.description }}
      </Message>
    </template>

    <template v-else-if="isSubmitType(schemaField)">
      <Button
        fluid
        class="mt-3 mb-1 cui-button-medium"
        :severity="schemaField.color"
        :loading
        :label="schemaField.title"
        @click.prevent="emit('onSubmit', { key: schemaField.key })"
      >
      </Button>
      <Message v-if="schemaField.description" severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ schemaField.description }}
      </Message>
    </template>

    <template v-else-if="isArrayType(schemaField) && schemaField.items">
      <Card class="cui-card border-color-inner" :pt="{ body: { class: 'p-1' } }">
        <template #content>
          <Accordion :key="triggerArrayRef" v-model:value="panelActive" multiple>
            <AccordionPanel :value="configKey ?? '0'" class="border-none">
              <AccordionHeader>
                <div class="flex gap-2 items-center w-full">
                  <i-mdi:information v-if="schemaField.description" v-tooltip="{ value: schemaField.description }" class="text-muted" />
                  <span class="text-color">{{ schemaField.title || configKey }}</span>
                  <Button
                    v-if="arrayItem"
                    text
                    rounded
                    severity="danger"
                    class="cui-icon-md ml-auto mr-2"
                    :loading
                    @click="removeArrayItem(arrayItem.key, arrayItem.index)"
                  >
                    <template #icon>
                      <i-mdi:close width="100%" height="100%" />
                    </template>
                  </Button>
                </div>
              </AccordionHeader>
              <AccordionContent>
                <div class="w-full h-full flex flex-col gap-6">
                  <template v-for="(item, index) in getArrayValue(modelValue, configKey)" :key="`item-${index}`">
                    <CuiSchemaField
                      v-model="modelValue"
                      :schema-field="schemaField.items"
                      :config-key="`${configKey}[${index}]`"
                      :array-item="{ key: configKey, index }"
                      :loading
                      @on-action="(state: any) => emit('onAction', state)"
                      @on-submit="(state: any) => emit('onSubmit', state)"
                      @on-trigger="() => triggerArrayRef++"
                    />
                  </template>

                  <div class="flex flex-row w-full items-center justify-center mt-3">
                    <Button text rounded class="cui-icon-md" :loading @click.prevent="addArrayItem(configKey)">
                      <template #icon>
                        <i-mdi:plus-circle width="100%" height="100%" />
                      </template>
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionPanel>
          </Accordion>
        </template>
      </Card>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  generateDefaultValue,
  getValueByKey,
  isArrayType,
  isBooleanType,
  isButtonType,
  isEnumType,
  isNumberType,
  isStringType,
  isSubmitType,
  isValidableStringType,
  setValueByKey,
} from '@shared/types';
import qrcode from 'qrcode';
import { ErrorMessage, Field } from 'vee-validate';

import type { CuiSchemaFieldEmits, CuiSchemaFieldProps } from './types.js';

const props = withDefaults(defineProps<CuiSchemaFieldProps>(), {
  loading: false,
});

const emit = defineEmits<CuiSchemaFieldEmits>();

const modelValue = defineModel<Record<string, any>>({
  type: Object,
  required: true,
});

const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);

const { schemaField, configKey } = toRefs(props);

const triggerFieldValue = ref(0);
const triggerArrayRef = ref(0);
const panelActive = ref<string[]>((schemaField.value as any).opened ? [configKey.value] : []);

const qrCode = computedAsync<string | undefined>(
  async () => {
    if (isStringType(schemaField.value) && schemaField.value.format === 'qrCode') {
      let color;

      if (theme.value === 'dark') {
        color = { dark: '#FFFFFFFF', light: '#FF000000' };
      } else {
        color = { dark: '#404040FF', light: '#FFFFFFFF' };
      }

      return await qrcode.toDataURL(fieldValue.value || '', {
        margin: 0.5,
        type: 'image/png',
        color,
        scale: 10,
      });
    }
    return undefined;
  },
  undefined,
  { lazy: true },
);

const imageSrc = computed(() => {
  if (isStringType(schemaField.value) && schemaField.value.format === 'image') {
    return fieldValue.value;
  }
  return undefined;
});

const fieldValue = computed({
  get: () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const trigger = triggerFieldValue.value;
    return getValueByKey(modelValue.value, configKey.value);
  },
  set: (newValue) => {
    const schema = schemaField.value;
    let convertedValue = newValue;

    if (isEnumType(schema)) {
      if (schema.multiple) {
        convertedValue = Array.isArray(newValue) ? newValue : [newValue];
      } else {
        convertedValue = newValue ? newValue.toString() : newValue;
      }
    } else if (isStringType(schema)) {
      convertedValue = newValue !== undefined && newValue !== null ? newValue.toString() : '';
    } else if (isNumberType(schema)) {
      convertedValue = typeof newValue === 'number' ? newValue : parseFloat(newValue) || 0;
    } else if (isBooleanType(schema)) {
      convertedValue = newValue === 'true' || newValue === true;
    }

    setValueByKey(modelValue.value, configKey.value, convertedValue);
    triggerFieldValue.value++;
  },
});

function getArrayValue(obj: Record<string, any>, key: string): any[] {
  const value = getValueByKey(obj, key);
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function addArrayItem(key: string): void {
  const value = getValueByKey(modelValue.value, key);
  const newArray = Array.isArray(value) ? [...value] : [];

  if (isArrayType(schemaField.value) && schemaField.value.items) {
    newArray.push(generateDefaultValue(schemaField.value.items as any));
    setValueByKey(modelValue.value, key, newArray);
    triggerArrayRef.value++;
  }
}

function removeArrayItem(key: string, index: number): void {
  const value = getValueByKey(modelValue.value, key);
  if (Array.isArray(value)) {
    const newArray = [...value];
    newArray.splice(index, 1);
    setValueByKey(modelValue.value, key, newArray);
    triggerArrayRef.value++;
    emit('onTrigger');
  }
}

watch(
  modelValue,
  () => {
    triggerFieldValue.value++;
  },
  { deep: true },
);
</script>

<style scoped></style>
