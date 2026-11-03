<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div v-if="stats && stats.paused === true" class="cui-banner cui-banner-error">
        <i-mdi:alert-circle-outline class="shrink-0 w-5 h-5" />
        <span>{{ stats.unreachable ? $t('views.settings.recordings.storage_unreachable') : $t('views.settings.recordings.disk_critical') }}</span>
      </div>
      <div v-else-if="stats && stats.diskFreePercent > 0 && stats.diskFreePercent < 8" class="cui-banner cui-banner-warn">
        <i-mdi:alert-outline class="shrink-0 w-5 h-5" />
        <span>{{ $t('views.settings.recordings.disk_warning') }}</span>
      </div>

      <div v-if="stats && stats.smallVolume" class="cui-banner cui-banner-warn">
        <i-mdi:alert-outline class="shrink-0 w-5 h-5" />
        <span>{{ $t('views.settings.recordings.disk_small_volume') }}</span>
      </div>

      <Message v-if="oauthChecked && oauthState.status !== 'connected'" severity="warn" size="small">
        {{ $t('views.settings.recordings.cloud_login_hint') }}
      </Message>

      <div>
        <span class="card-title">{{ $t('views.settings.recordings.license_title') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm">{{ licenseStatus }}</p>
                <p class="text-xs text-muted-color mt-1">{{ $t('views.settings.recordings.license_description') }}</p>
              </div>
              <CuiPluginOAuthButton :plugin-name="NVR_PLUGIN_NAME" class="flex-shrink-0" />
            </div>
          </template>
        </Card>
      </div>

      <CuiSchema
        v-if="pluginConfig"
        :schema-form="{ schema: pluginConfig.schema, config: pluginConfig.config }"
        :loading="storageLoading"
        groups-as-cards
        :group-descriptions="groupDescriptions"
        @on-action="onAction"
        @on-submit="onSubmit"
        @on-form-submit="onFormSubmit"
      />
      <div v-else>
        <span class="card-title">{{ $t('views.settings.recordings.global_settings') }}</span>
        <Card class="cui-card">
          <template #content>
            <div v-if="isLoading || storageLoading" class="flex items-center justify-center py-8">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
            <div v-else class="text-sm text-muted text-center py-8">
              {{ $t('views.settings.recordings.not_available') }}
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useOAuth, usePluginStorage } from '@camera.ui/browser';
import { useStorageStats } from '@camera.ui/nvr';

import { NVR_PLUGIN_NAME } from '@/common/constants.js';
import CuiPluginOAuthButton from '@/components/CuiPluginCard/CuiPluginOAuthButton.vue';
import CuiSchema from '@/components/CuiSchema/CuiSchema.vue';

const { t } = useI18n();
const toast = useCuiToast();
const { stats, isLoading, refresh: refreshStats } = useStorageStats();
const { state: oauthState, refresh: refreshOAuth } = useOAuth(NVR_PLUGIN_NAME);
const { isConnected: pluginConnected, isLoading: storageLoading, config: pluginConfig, getConfig, setConfig, setValue, submitValue } = usePluginStorage(NVR_PLUGIN_NAME);

const oauthChecked = ref(false);

const groupDescriptions = computed<Record<string, string>>(() => ({
  License: t('views.settings.recordings.group_info_license'),
  Storage: t('views.settings.recordings.group_info_storage'),
  'Face Recognition': t('views.settings.recordings.group_info_faces'),
  GenAI: t('views.settings.recordings.group_info_genai'),
  Moments: t('views.settings.recordings.group_info_moments'),
  Episodes: t('views.settings.recordings.group_info_episodes'),
}));

const licenseStatus = computed(() => {
  switch (oauthState.value.status) {
    case 'connected':
      return t('components.oauth.connected_as', { email: oauthState.value.userEmail || '—' });
    case 'awaiting_user':
    case 'polling':
      return t('components.oauth.tooltip_authorizing');
    case 'error':
      return t('components.oauth.error_generic');
    default:
      return t('views.settings.recordings.license_disconnected');
  }
});

async function onAction(state: { key: string }): Promise<void> {
  try {
    await setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
    refreshStats();
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onSubmit(state: { key: string; payload: any }): Promise<void> {
  try {
    const response = await submitValue(state.key, state.payload);
    if (response?.toast) {
      toast.add({ severity: response.toast.type, detail: response.toast.message, life: 3000 });
    } else {
      toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
    }
    refreshStats();
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onFormSubmit(config: Record<string, unknown>): Promise<void> {
  try {
    await setConfig(config);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
    refreshStats();
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

watch(
  pluginConnected,
  async (connected) => {
    if (connected) {
      await getConfig();
    }
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    await refreshOAuth();
  } finally {
    oauthChecked.value = true;
  }
});
</script>

<style scoped></style>
