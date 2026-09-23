<template>
  <div class="flex w-full flex-col gap-6">
    <div class="flex flex-col field-gap">
      <label for="assistantModelProvider" class="cui-label">{{ $t('views.settings.assistant_provider_label') }}</label>
      <Select
        v-model="provider"
        input-id="assistantModelProvider"
        :options="providerOptions"
        option-label="label"
        option-value="value"
        fluid
        @change="onProviderChange"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_provider_hint') }}</Message>
    </div>

    <div v-if="showBaseUrl" class="flex flex-col field-gap">
      <label for="assistantModelBaseUrl" class="cui-label">{{ $t('views.settings.assistant_base_url_label') }}</label>
      <InputText id="assistantModelBaseUrl" v-model.trim="baseURL" :placeholder="ASSISTANT_DEFAULT_BASE_URLS[provider]" fluid autocomplete="off" />
    </div>

    <div v-if="needsKey || provider === 'openai-compatible'" class="flex flex-col field-gap">
      <label for="assistantModelKey" class="cui-label">{{ $t('views.settings.assistant_api_key_label') }}</label>
      <Select v-if="keySources.length" v-model="keySource" :options="keySourceOptions" option-label="label" option-value="value" fluid />
      <template v-if="keySource === NEW_KEY_SOURCE">
        <Password
          v-model="apiKey"
          input-id="assistantModelKey"
          :feedback="false"
          toggle-mask
          fluid
          autocomplete="new-password"
          :invalid="invalid && keyMissing"
          :placeholder="keptKey ? '••••••••' : ''"
        />
        <Message v-if="keptKey" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_api_key_keep_hint') }}</Message>
        <Message v-else-if="!needsKey" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
          $t('views.settings.assistant_api_key_optional')
        }}</Message>
      </template>
    </div>

    <div v-if="pluginProvider" class="flex flex-col field-gap">
      <label for="assistantModelPluginModel" class="cui-label">{{ $t('views.settings.assistant_model_label') }}</label>
      <Select
        v-if="pluginModels.length"
        v-model="model"
        input-id="assistantModelPluginModel"
        :options="pluginModels"
        option-label="name"
        option-value="id"
        fluid
        :invalid="invalid && !model.trim()"
      />
      <ProgressBar v-else-if="pluginProgress !== undefined" :value="pluginProgress" :show-value="false" class="!h-1" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ pluginModelHint }}</Message>
    </div>

    <div v-else class="flex flex-col field-gap">
      <label for="assistantModelModel" class="cui-label">{{ $t('views.settings.assistant_model_label') }}</label>
      <AutoComplete
        v-model="model"
        input-id="assistantModelModel"
        :suggestions="suggestions"
        :loading="modelsMutation.isPending.value"
        :invalid="invalid && !model.trim()"
        dropdown
        fluid
        :placeholder="$t('views.settings.assistant_model_placeholder')"
        @complete="onModelSearch"
        @dropdown-click="loadModels"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_model_info') }}</Message>
    </div>

    <div v-if="!pluginProvider" class="flex flex-col field-gap">
      <label for="assistantModelContext" class="cui-label">{{ $t('views.settings.assistant_model_context_label') }}</label>
      <InputNumber
        v-model="contextTokens"
        input-id="assistantModelContext"
        :min="1000"
        :max="400000"
        :step="1000"
        :use-grouping="false"
        :placeholder="$t('views.settings.assistant_model_context_placeholder')"
        fluid
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_model_context_info') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label for="assistantModelName" class="cui-label">{{ $t('views.settings.assistant_model_name_label') }}</label>
      <InputText id="assistantModelName" v-model.trim="name" :placeholder="model.trim() || $t('views.settings.assistant_model_name_placeholder')" maxlength="40" fluid />
    </div>

    <div class="flex items-center gap-4 cui-toggle-switch">
      <div class="flex flex-col field-switch-gap">
        <label for="assistantModelUsers" class="cui-label-switch">{{ $t('views.settings.assistant_model_users') }}</label>
        <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.assistant_model_users_info') }}</Message>
      </div>
      <ToggleSwitch v-model="userAccess" input-id="assistantModelUsers" class="ml-auto shrink-0" />
    </div>

    <div class="flex items-center gap-4 cui-toggle-switch">
      <div class="flex flex-col field-switch-gap">
        <label for="assistantModelRouting" class="cui-label-switch">{{ $t('views.settings.assistant_model_routing') }}</label>
        <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.assistant_model_routing_info') }}</Message>
      </div>
      <ToggleSwitch v-model="toolRouting" input-id="assistantModelRouting" class="ml-auto shrink-0" />
    </div>

    <div v-if="entry" class="flex items-center gap-4 cui-toggle-switch">
      <div class="flex flex-col field-switch-gap">
        <label for="assistantModelImages" class="cui-label-switch">{{ $t('views.settings.assistant_send_images') }}</label>
        <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
          entry.capabilities?.vision === false ? $t('views.settings.assistant_send_images_no_vision') : $t('views.settings.assistant_send_images_info')
        }}</Message>
      </div>
      <ToggleSwitch v-model="sendImages" input-id="assistantModelImages" class="ml-auto shrink-0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AssistantQuery } from '@/api/routes/assistant.js';
import { ASSISTANT_DEFAULT_BASE_URLS, ASSISTANT_KEY_PROVIDERS, ASSISTANT_PROVIDERS } from '@/common/assistantModels.js';

import { NEW_KEY_SOURCE } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { AssistantModelInput, DBAssistantProvider } from '@shared/types';
import type { AutoCompleteCompleteEvent } from 'primevue/autocomplete';
import type { AssistantModelFormProps } from './types.js';

const assistantQuery = new AssistantQuery();

const props = defineProps<AssistantModelFormProps>();

const { t, locale } = useI18n();
const toast = useCuiToast();

const modelsMutation = assistantQuery.listAssistantModelsMutation();

const provider = ref<DBAssistantProvider>(props.entry?.provider ?? 'ollama');
const baseURL = ref(props.entry?.baseURL ?? '');
const apiKey = ref('');
const model = ref(props.entry?.model ?? '');
const name = ref(props.entry && props.entry.name !== props.entry.model ? props.entry.name : '');
const sendImages = ref(props.entry?.sendImages ?? false);
const contextTokens = ref<number | null>(props.entry?.contextTokens ?? null);
const toolRouting = ref(props.entry?.toolRouting ?? false);
const userAccess = ref(props.entry?.userAccess !== false);
const keySource = ref<string>(NEW_KEY_SOURCE);
const available = ref<string[]>([]);
const suggestions = ref<string[]>([]);
const invalid = ref(false);

const providerOptions = computed(() => [
  ...ASSISTANT_PROVIDERS.map((entry) => ({ label: entry.label, value: entry.value as string })),
  ...props.modelProviders.map((entry) => ({ label: t('views.settings.assistant_provider_plugin', { name: entry.pluginName }), value: entry.provider })),
]);

const pluginProvider = computed(() => props.modelProviders.find((entry) => entry.provider === provider.value));
const pluginModels = computed(() => pluginProvider.value?.models ?? []);

const pluginStatus = computed(() => pluginProvider.value?.status);
const pluginProgress = computed(() => {
  const progress = pluginStatus.value?.ready === false ? pluginStatus.value.progress : undefined;
  return progress === undefined ? undefined : Math.round(progress * 100);
});

const pluginModelHint = computed(() => {
  if (pluginStatus.value?.ready === false) return pluginStatus.value.message || t('views.settings.assistant_model_plugin_loading');
  if (!pluginModels.value.length) return t('views.settings.assistant_model_plugin_none');

  const spec = pluginModels.value.find((entry) => entry.id === model.value);
  if (!spec) return t('views.settings.assistant_model_plugin_info');
  const context = t('views.settings.assistant_model_context', { tokens: spec.contextTokens.toLocaleString(locale.value) });
  return spec.note ? `${spec.note} ${context}` : context;
});

const needsKey = computed(() => ASSISTANT_KEY_PROVIDERS.includes(provider.value) && !pluginProvider.value);
const showBaseUrl = computed(() => provider.value === 'ollama' || provider.value === 'openai-compatible');
const keptKey = computed(() => props.entry?.apiKeySet === true && props.entry.provider === provider.value);
const keySources = computed(() => props.models.filter((entry) => entry._id !== props.entry?._id && entry.provider === provider.value && entry.apiKeySet));

const keySourceOptions = computed(() => [
  { label: keptKey.value ? t('views.settings.assistant_api_key_stored') : t('views.settings.assistant_api_key_new'), value: NEW_KEY_SOURCE },
  ...keySources.value.map((entry) => ({ label: t('views.settings.assistant_api_key_from', { name: entry.name }), value: entry._id })),
]);

const keyMissing = computed(() => needsKey.value && keySource.value === NEW_KEY_SOURCE && !apiKey.value && !keptKey.value);

function defaultKeySource(): string {
  return keptKey.value ? NEW_KEY_SOURCE : (keySources.value[0]?._id ?? NEW_KEY_SOURCE);
}

function request(): AssistantModelInput {
  const key =
    keySource.value !== NEW_KEY_SOURCE
      ? { copyKeyFrom: keySource.value }
      : apiKey.value
        ? { apiKey: apiKey.value }
        : props.entry && !keptKey.value
          ? { apiKey: null }
          : {};
  return {
    ...(props.entry ? { id: props.entry._id, retest: true, sendImages: sendImages.value } : {}),
    ...key,
    name: name.value,
    provider: provider.value,
    baseURL: showBaseUrl.value && baseURL.value ? baseURL.value : null,
    model: model.value.trim(),
    userAccess: userAccess.value,
    contextTokens: pluginProvider.value ? null : (contextTokens.value ?? null),
    toolRouting: toolRouting.value,
  };
}

function onProviderChange(): void {
  baseURL.value = '';
  model.value = '';
  available.value = [];
  suggestions.value = [];
  keySource.value = defaultKeySource();
}

function onModelSearch(event: AutoCompleteCompleteEvent): void {
  const query = event.query.toLowerCase();
  suggestions.value = available.value.filter((candidate) => candidate.toLowerCase().includes(query));
}

async function loadModels(): Promise<void> {
  const result = await modelsMutation.mutateAsync(request());
  if (result.error) {
    toast.add({ severity: 'warn', detail: t('views.settings.assistant_models_failed', { message: result.error }), life: 5000 });
    return;
  }
  available.value = result.models;
  suggestions.value = result.models;
}

watch(
  () => pluginModels.value.find((spec) => spec.id === model.value),
  (spec) => {
    if (spec && props.entry?.toolRouting == null) toolRouting.value = spec.toolRouting === true;
  },
  { immediate: true },
);

onBeforeMount(() => {
  keySource.value = defaultKeySource();
});

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    if (!model.value.trim() || keyMissing.value) {
      invalid.value = true;
      return null;
    }
    return request();
  },
});
</script>
