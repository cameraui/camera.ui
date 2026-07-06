<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">{{ $t('components.automation_import.intro') }}</p>

    <Message v-if="missingInterfaces.length" severity="error" class="text-sm">
      <div class="flex flex-col gap-2">
        <span>{{ $t('components.automation_import.missing_plugins', { plugins: missingInterfaces.map(humanizeInterface).join(', ') }) }}</span>
        <Button size="small" severity="contrast" outlined class="self-start" :label="$t('components.automation_import.open_plugin_store')" @click="openPluginStore" />
      </div>
    </Message>

    <div v-if="!inputs.length && !missingInterfaces.length" class="text-sm text-muted">
      {{ $t('components.automation_import.no_inputs') }}
    </div>

    <div v-for="input in inputs" :key="input.key" class="flex flex-col">
      <AutomationInputPicker :input="input" :model-value="bindings[input.key]" @update:model-value="setBinding(input.key, $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AutomationsQuery } from '@/api/routes/automations.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { collectRequiredInterfaces, resolveBlueprint, resolveInputs } from '@/common/automationBlueprint.js';
import AutomationInputPicker from './AutomationInputPicker.vue';

import type { BindingValue, SensorBinding, WizardInput } from '@/common/automationBlueprint.js';
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { AutomationImportProps } from './types.js';

const PluginSearchDialog = asyncComponent(() => import('@/components/CuiDialog/templates/PluginSearch/PluginSearch.vue'));

const automationsQuery = new AutomationsQuery();
const pluginsQuery = new PluginsQuery();

const props = defineProps<AutomationImportProps>();

const router = useRouter();
const dialog = useCuiDialog();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { data: pluginsData } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });
const { mutateAsync: importBlueprint, isPending: isImporting } = automationsQuery.importBlueprintQuery();

const bindings = reactive<Record<string, BindingValue>>({});

const inputs = computed<WizardInput[]>(() => resolveInputs(props.blueprint));

const requiredInterfaces = computed(() => collectRequiredInterfaces(props.blueprint, inputs.value));

const installedInterfaces = computed(() => {
  const set = new Set<string>();
  for (const plugin of pluginsData.value?.result ?? []) {
    for (const iface of plugin.contract?.interfaces ?? []) set.add(iface);
  }
  return set;
});

const missingInterfaces = computed(() => requiredInterfaces.value.filter((iface) => !installedInterfaces.value.has(iface)));

const allBound = computed(() => inputs.value.every((input) => isInputBound(input, bindings[input.key])));

const canImport = computed(() => missingInterfaces.value.length === 0 && allBound.value);

function isInputBound(input: WizardInput, value: BindingValue): boolean {
  switch (input.type) {
    case 'notification-targets':
      return Array.isArray(value) && value.length > 0;
    case 'sensor': {
      const binding = value as SensorBinding | undefined;
      return Boolean(binding?.sensorType && binding.sensorName && binding.sensorPluginId);
    }
    default:
      return typeof value === 'string' && value.length > 0;
  }
}

function setBinding(key: string, value: BindingValue) {
  bindings[key] = value;
}

function humanizeInterface(iface: string): string {
  return iface.replace(/([A-Z])/g, ' $1').trim() || iface;
}

function openPluginStore() {
  dialog.openComponentDialog(PluginSearchDialog, {
    data: {
      title: t('components.dialog.title.search_plugin'),
      contentProps: {},
      hideConfirmButton: true,
      fullscreen: true,
    },
  });
}

async function onConfirm() {
  if (!canImport.value) return null;

  const resolved = resolveBlueprint(props.blueprint, inputs.value, { ...bindings });
  const flow = await importBlueprint({ blueprint: resolved as unknown as Record<string, unknown> });
  router.push(`/automations/${flow._id}`);
}

watch(
  canImport,
  (ready) => {
    dialogRefProps.disabled.value = !ready;
  },
  { immediate: true },
);

defineExpose({
  isLoading: isImporting,
  onConfirm,
});
</script>
