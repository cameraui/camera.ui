<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.plugin_name') }}</label>
      <Select
        :model-value="data.pluginName"
        :options="pluginOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.plugin_name_placeholder')"
        class="w-full"
        :loading="pluginsLoading"
        @update:model-value="onPluginChange"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.plugin_interface') }}</label>
      <Select
        :model-value="data.pluginInterface"
        :options="interfaceOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.plugin_interface_placeholder')"
        class="w-full"
        :disabled="!data.pluginName"
        @update:model-value="onInterfaceChange"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.plugin_method') }}</label>
      <Select
        :model-value="data.method"
        :options="methodOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.plugin_method_placeholder')"
        class="w-full"
        :disabled="!data.pluginInterface"
        @update:model-value="onMethodChange"
      />
    </div>

    <template v-if="selectedMethod">
      <div v-for="param in selectedMethod.params" :key="param.name" class="flex flex-col field-gap">
        <label class="cui-label">{{ t(param.labelKey) }}</label>
        <VariableInput
          :model-value="data.params[param.name] ?? ''"
          :node-id="nodeId"
          :placeholder="param.placeholder"
          @update:model-value="updateParam(param.name, String($event ?? ''))"
        />
      </div>
    </template>

    <template v-if="selectedMethod?.settingsMethod && pluginInterfaceSchema?.length">
      <Divider />
      <div class="flex flex-col gap-3">
        <span class="text-xs font-semibold text-muted uppercase">{{ t('components.automation_nodes.plugin_settings') }}</span>
        <CuiSchema
          :schema-form="{ schema: pluginInterfaceSchema, config: data.config ?? {} }"
          :loading="schemaLoading"
          :save-button-label="t('components.automation_nodes.plugin_apply_settings')"
          show-button
          @on-form-submit="onConfigChange"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { usePlugin } from '@camera.ui/browser';

import { AutomationsQuery } from '@/api/routes/automations.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import VariableInput from './VariableInput.vue';

import type { PluginMethodDef } from '@/api/routes/automations.js';
import type { JsonSchema } from '@camera.ui/sdk';
import type { ConfigActionPluginProps, ConfigNodeUpdateEmits } from '../types.js';

const pluginsQuery = new PluginsQuery();
const automationsQuery = new AutomationsQuery();

const props = defineProps<ConfigActionPluginProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { plugin: pluginProxy } = usePlugin(computed(() => props.data.pluginName));

const { data: pluginsData, isBusy: pluginsLoading } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });
const { data: methodRegistry } = automationsQuery.getPluginMethodsQuery();

const pluginInterfaceSchema = shallowRef<JsonSchema[] | undefined>();
const schemaLoading = ref(false);

const pluginOptions = computed(() => {
  if (!pluginsData.value?.result) return [];
  return pluginsData.value.result
    .filter((p) => p.contract?.interfaces?.length)
    .map((p) => ({
      label: p.pluginName,
      value: p.pluginName,
    }));
});

const selectedPlugin = computed(() => {
  if (!props.data.pluginName || !pluginsData.value?.result) return undefined;
  return pluginsData.value.result.find((p) => p.pluginName === props.data.pluginName);
});

const interfaceOptions = computed(() => {
  const ifaces = selectedPlugin.value?.contract?.interfaces ?? [];
  return ifaces
    .filter((i) => getMethodsForInterface(i).length > 0)
    .map((i) => ({
      label: i.replace(/([A-Z])/g, ' $1').trim(),
      value: i,
    }));
});

const methodOptions = computed(() => {
  if (!props.data.pluginInterface) return [];
  return getMethodsForInterface(props.data.pluginInterface).map((m) => ({
    label: t(m.labelKey),
    value: m.id,
  }));
});

const selectedMethod = computed(() => {
  if (!props.data.pluginInterface || !props.data.method) return undefined;
  return getMethodsForInterface(props.data.pluginInterface).find((m) => m.id === props.data.method);
});

function getMethodsForInterface(iface: string): PluginMethodDef[] {
  return methodRegistry.value?.[iface] ?? [];
}

async function loadSettingsSchema(): Promise<void> {
  const settingsMethod = selectedMethod.value?.settingsMethod;
  if (!settingsMethod || !pluginProxy.value) {
    pluginInterfaceSchema.value = undefined;
    return;
  }

  schemaLoading.value = true;
  try {
    const fn = (pluginProxy.value as unknown as Record<string, (() => Promise<JsonSchema[]>) | undefined>)[settingsMethod];
    pluginInterfaceSchema.value = fn ? await fn() : undefined;
  } catch {
    pluginInterfaceSchema.value = undefined;
  } finally {
    schemaLoading.value = false;
  }
}

function onPluginChange(value: unknown) {
  emit('update:data', { pluginName: value, pluginInterface: '', method: '', params: {}, config: {} });
}

function onInterfaceChange(value: unknown) {
  emit('update:data', { pluginInterface: value, method: '', params: {}, config: {} });
}

function onMethodChange(value: unknown) {
  emit('update:data', { method: value, params: {}, config: {} });
}

function updateParam(name: string, value: string) {
  emit('update:data', { params: { ...props.data.params, [name]: value } });
}

function onConfigChange(configData: Record<string, unknown>) {
  emit('update:data', { config: { ...props.data.config, ...configData } });
}

watch([selectedMethod, pluginProxy], () => loadSettingsSchema(), { immediate: true });
</script>
