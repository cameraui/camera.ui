<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div v-if="stats && stats.diskFreePercent > 0 && stats.diskFreePercent < 5" class="cui-banner cui-banner-error">
        <i-mdi:alert-circle-outline class="shrink-0 w-5 h-5" />
        <span>{{ $t('views.settings.recordings.disk_critical') }}</span>
      </div>
      <div v-else-if="stats && stats.diskFreePercent > 0 && stats.diskFreePercent < 8" class="cui-banner cui-banner-warn">
        <i-mdi:alert-outline class="shrink-0 w-5 h-5" />
        <span>{{ $t('views.settings.recordings.disk_warning') }}</span>
      </div>

      <div v-if="stats && stats.smallVolume" class="cui-banner cui-banner-warn">
        <i-mdi:alert-outline class="shrink-0 w-5 h-5" />
        <span>{{ $t('views.settings.recordings.disk_small_volume') }}</span>
      </div>

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

      <div>
        <span class="card-title">{{ $t('views.settings.recordings.storage_overview') }}</span>
        <Card class="cui-card">
          <template #content>
            <div v-if="isLoading && !stats" class="flex items-center justify-center py-8">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
            <div v-else-if="!stats" class="text-sm text-muted text-center py-8">
              {{ $t('views.settings.recordings.not_available') }}
            </div>
            <div v-else class="flex flex-col sm:flex-row items-center gap-6">
              <div class="shrink-0" style="width: 180px; height: 180px">
                <Doughnut :data="chartData" :options="chartOptions" />
              </div>
              <CuiDataTable :value="overviewRows" :pt="tablePtOptions" striped-rows :show-headers="false" class="w-full">
                <Column field="label">
                  <template #body="{ data }">
                    <span class="text-color">{{ data.label }}</span>
                  </template>
                </Column>
                <Column field="value" style="text-align: right">
                  <template #body="{ data }">
                    <span class="font-medium">{{ data.value }}</span>
                  </template>
                </Column>
              </CuiDataTable>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.recordings.global_settings') }}</span>
        <Card class="cui-card">
          <template #content>
            <CuiSchema
              v-if="pluginConfig"
              :schema-form="{ schema: pluginConfig.schema, config: pluginConfig.config }"
              :loading="storageLoading"
              save-button-color="success"
              @on-action="onAction"
              @on-submit="onSubmit"
              @on-form-submit="onFormSubmit"
            />
            <div v-else-if="isLoading || storageLoading" class="flex items-center justify-center py-8">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
            <div v-else class="text-sm text-muted text-center py-8">
              {{ $t('views.settings.recordings.not_available') }}
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.recordings.camera_storage') }}</span>
        <Card class="cui-card">
          <template #content>
            <div v-if="isLoading && !stats" class="flex items-center justify-center py-8">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
            <div v-else-if="!stats" class="text-sm text-muted text-center py-8">
              {{ $t('views.settings.recordings.not_available') }}
            </div>
            <CuiDataTable v-else :value="cameraRows" :pt="tablePtOptions" striped-rows scrollable>
              <Column field="status" :header="''" style="width: 3rem">
                <template #body="{ data }">
                  <div class="flex items-center justify-center">
                    <Badge
                      v-tooltip="{ value: data.isRecording ? $t('views.settings.recordings.status_recording') : $t('views.settings.recordings.status_stopped') }"
                      :style="{ background: data.isRecording ? 'green' : 'gray' }"
                    />
                  </div>
                </template>
              </Column>
              <Column field="name" :header="$t('views.settings.recordings.col_camera')">
                <template #body="{ data }">
                  <span class="font-medium">{{ data.name }}</span>
                </template>
              </Column>
              <Column field="size" :header="$t('views.settings.recordings.col_size')">
                <template #body="{ data }">
                  {{ formatBytes(data.usedBytes) }}
                </template>
              </Column>
              <Column field="daysCount" :header="$t('views.settings.recordings.col_days')" />
              <Column field="rate" :header="$t('views.settings.recordings.col_rate')">
                <template #body="{ data }">
                  {{ data.bandwidthMBh > 0 ? formatRate(data.bandwidthMBh) : '-' }}
                </template>
              </Column>
              <Column field="recordingMode" :header="$t('views.settings.recordings.col_mode')">
                <template #body="{ data }">
                  <Chip :label="data.recordingMode" class="text-xs" />
                </template>
              </Column>
              <template #empty>
                <span class="text-muted text-sm">{{ $t('views.settings.recordings.no_cameras') }}</span>
              </template>
            </CuiDataTable>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useOAuth, usePluginStorage } from '@camera.ui/browser';
import { useStorageStats } from '@camera.ui/nvr';
import { ArcElement, Chart as ChartJS, DoughnutController, Tooltip } from 'chart.js';
import { Doughnut } from 'vue-chartjs';

import { CamerasQuery } from '@/api/routes/cameras.js';
import CuiPluginOAuthButton from '@/components/CuiPluginCard/CuiPluginOAuthButton.vue';
import CuiSchema from '@/components/CuiSchema/CuiSchema.vue';

import type { ChartData, ChartOptions } from 'chart.js';
import type { DataTablePassThroughOptions } from 'primevue';

ChartJS.register(DoughnutController, ArcElement, Tooltip);

interface CameraRow {
  id: string;
  name: string;
  usedBytes: number;
  segmentCount: number;
  oldestDay: string;
  newestDay: string;
  daysCount: number;
  bandwidthMBh: number;
  recordingMode: string;
  isRecording: boolean;
}

interface OverviewRow {
  label: string;
  value: string;
}

const NVR_PLUGIN_NAME = '@camera.ui/camera-ui-nvr';

const camerasQuery = new CamerasQuery();

const { t } = useI18n();
const toast = useCuiToast();
const { stats, isLoading, refresh: refreshStats } = useStorageStats();
const { state: oauthState } = useOAuth(NVR_PLUGIN_NAME);
const { isConnected: pluginConnected, isLoading: storageLoading, config: pluginConfig, getConfig, setConfig, setValue, submitValue } = usePluginStorage(NVR_PLUGIN_NAME);

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

const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const tablePtOptions: DataTablePassThroughOptions = {
  bodyRow: {
    class: 'text-sm text-secondary',
  },
  column: {
    columnTitle: {
      class: 'text-sm',
    },
  },
};

const cameraNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const cam of camerasData.value?.result ?? []) {
    map.set(cam._id, cam.name);
  }
  return map;
});

const cameraRows = computed<CameraRow[]>(() => {
  if (!stats.value?.cameras) return [];
  return Object.entries(stats.value.cameras)
    .map(([id, cam]) => ({
      id,
      name: cameraNameMap.value.get(id) || id,
      usedBytes: cam.usedBytes,
      segmentCount: cam.segmentCount,
      oldestDay: cam.oldestDay,
      newestDay: cam.newestDay,
      daysCount: cam.daysCount,
      bandwidthMBh: cam.bandwidthMBh,
      recordingMode: cam.recordingMode,
      isRecording: cam.isRecording,
    }))
    .sort((a, b) => b.usedBytes - a.usedBytes);
});

const overviewRows = computed<OverviewRow[]>(() => {
  if (!stats.value) return [];
  return [
    { label: t('views.settings.recordings.disk_total'), value: formatGB(stats.value.diskTotalGB) },
    { label: t('views.settings.recordings.nvr_usage'), value: formatGB(stats.value.nvrUsedGB) },
    { label: t('views.settings.recordings.quota'), value: stats.value.nvrQuotaGB > 0 ? formatGB(stats.value.nvrQuotaGB) : t('views.settings.recordings.unlimited') },
    {
      label: t('views.settings.recordings.retention'),
      value: stats.value.retentionDays > 0 ? t('views.settings.recordings.days_count', { count: stats.value.retentionDays }) : t('views.settings.recordings.unlimited'),
    },
    { label: t('views.settings.recordings.disk_free'), value: `${formatGB(stats.value.diskFreeGB)} (${stats.value.diskFreePercent.toFixed(1)}%)` },
  ];
});

const chartData = computed<ChartData<'doughnut'>>(() => {
  const nvrUsed = stats.value?.nvrUsedGB ?? 0;
  const diskFree = stats.value?.diskFreeGB ?? 0;
  const otherUsed = Math.max(0, (stats.value?.diskUsedGB ?? 0) - nvrUsed);

  // When all values are 0, show a full "free" ring so the chart isn't invisible
  const isEmpty = nvrUsed === 0 && otherUsed === 0 && diskFree === 0;

  return {
    labels: [t('views.settings.recordings.chart_nvr'), t('views.settings.recordings.chart_other'), t('views.settings.recordings.chart_free')],
    datasets: [
      {
        data: isEmpty ? [0, 0, 1] : [nvrUsed, otherUsed, diskFree],
        backgroundColor: ['#df2a4c', 'rgba(223,42,76,0.35)', 'rgba(223,42,76,0.10)'],
        borderWidth: 0,
      },
    ],
  };
});

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: true,
  cutout: '65%',
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.label}: ${formatGB(ctx.parsed)}`,
      },
    },
  },
}));

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

function formatGB(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(gb * 1000).toFixed(0)} MB`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function formatRate(mbPerHour: number): string {
  const gbPerDay = (mbPerHour * 24) / 1000;
  if (gbPerDay >= 1) return `${gbPerDay.toFixed(1)} GB/d`;
  return `${(gbPerDay * 1000).toFixed(0)} MB/d`;
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
</script>

<style scoped></style>
