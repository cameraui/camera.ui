<template>
  <div ref="containerRef">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t(`views.${String($route.name).toLowerCase()}.title`) }}
    </h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <Tabs v-model:value="currentTab" class="metrics-tabs">
      <TabList class="mb-4">
        <Tab value="overview" class="text-sm">{{ $t('views.metrics.tab_overview') }}</Tab>
        <Tab value="cameras" class="text-sm">{{ $t('views.metrics.tab_cameras') }}</Tab>
        <Tab value="storage" class="text-sm">{{ $t('views.metrics.tab_storage') }}</Tab>
      </TabList>

      <TabPanels class="!p-0 !bg-transparent">
        <TabPanel value="overview">
          <div class="flex flex-col gap-6">
            <div>
              <span class="card-title">{{ $t('views.metrics.general') }}</span>
              <CuiChartTable :items="systemItems" :headers="headers('system')" :chart-data="systemChartData" :empty-message="$t('views.metrics.no_system')" />
            </div>

            <div>
              <span class="card-title">{{ $t('views.metrics.core') }}</span>
              <CuiChartTable :items="coreItems" :headers="headers('core')" :chart-data="coreChartData" :empty-message="$t('views.metrics.no_core')" />
            </div>

            <div>
              <span class="card-title">{{ $t('views.metrics.plugins') }}</span>
              <CuiChartTable
                :items="pluginItems"
                :headers="headers('plugins')"
                :chart-data="pluginsChartData"
                :loading="pluginsLoading"
                paginator
                :pagination="{ page: tablePages.plugins }"
                :total-records="pluginItems.length"
                :empty-message="$t('views.metrics.no_plugins')"
                @update:page="onPage($event, 'plugins')"
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="cameras">
          <div class="flex flex-col gap-6">
            <div>
              <span class="card-title">{{ $t('views.metrics.cameras') }}</span>
              <CuiChartTable
                :key="showStreams ? 'streams' : 'processes'"
                :items="showStreams ? streamStats : frameworkerItems"
                :headers="showStreams ? streamHeaders : headers('frameworker')"
                :chart-data="showStreams ? undefined : frameworkerChartData"
                :loading="frameWorkersLoading"
                paginator
                :pagination="{ page: showStreams ? tablePages.streams : tablePages.frameworker }"
                :total-records="showStreams ? streamStats.length : frameworkerItems.length"
                :empty-message="$t('views.metrics.no_cameras')"
                @update:page="onPage($event, showStreams ? 'streams' : 'frameworker')"
              >
                <template #actions>
                  <div class="flex items-end gap-2">
                    <Button v-tooltip.top="{ value: $t('views.metrics.copy') }" severity="secondary" outlined class="cui-button-medium" @click="copyCameras">
                      <template #icon>
                        <i-mdi:content-copy />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: showStreams ? $t('views.metrics.show_processes') : $t('views.metrics.show_streams'), disabled: !xsBreakpoint }"
                      severity="secondary"
                      outlined
                      class="cui-button-medium"
                      :label="xsBreakpoint ? undefined : showStreams ? $t('views.metrics.show_processes') : $t('views.metrics.show_streams')"
                      @click="showStreams = !showStreams"
                    >
                      <template v-if="xsBreakpoint" #icon>
                        <i-mdi:chart-timeline-variant v-if="showStreams" />
                        <i-mdi:transit-connection-variant v-else />
                      </template>
                    </Button>
                  </div>
                </template>
              </CuiChartTable>
            </div>

            <div>
              <span class="card-title">{{ $t('views.metrics.analysis') }}</span>
              <CuiChartTable
                :items="analysisItems"
                :headers="analysisHeaders"
                :loading="frameWorkersLoading"
                paginator
                :pagination="{ page: tablePages.frameworker }"
                :total-records="analysisItems.length"
                :empty-message="$t('views.metrics.no_cameras')"
                @update:page="onPage($event, 'frameworker')"
              >
                <template #actions>
                  <div class="flex items-end gap-2">
                    <Button v-tooltip.top="{ value: $t('views.metrics.copy') }" severity="secondary" outlined class="cui-button-medium" @click="copyAnalysis">
                      <template #icon>
                        <i-mdi:content-copy />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: showInference ? $t('views.metrics.show_performance') : $t('views.metrics.show_inference'), disabled: !xsBreakpoint }"
                      severity="secondary"
                      outlined
                      class="cui-button-medium"
                      :label="xsBreakpoint ? undefined : showInference ? $t('views.metrics.show_performance') : $t('views.metrics.show_inference')"
                      @click="showInference = !showInference"
                    >
                      <template v-if="xsBreakpoint" #icon>
                        <i-mdi:chart-timeline-variant v-if="showInference" />
                        <i-mdi:brain v-else />
                      </template>
                    </Button>
                  </div>

                  <div class="flex items-end gap-2">
                    <Button
                      v-tooltip.top="{ value: $t('views.metrics.reset'), disabled: !xsBreakpoint }"
                      severity="secondary"
                      class="cui-button-medium"
                      :loading="resetPerfLoading"
                      :label="xsBreakpoint ? undefined : $t('views.metrics.reset')"
                      @click="confirmReset"
                    >
                      <template v-if="xsBreakpoint" #icon>
                        <i-ic:round-restart-alt />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: $t('views.metrics.benchmark'), disabled: !xsBreakpoint }"
                      class="cui-button-medium"
                      :disabled="resetPerfLoading"
                      :label="xsBreakpoint ? undefined : $t('views.metrics.benchmark')"
                      @click="openBenchmark"
                    >
                      <template v-if="xsBreakpoint" #icon>
                        <i-mdi:speedometer />
                      </template>
                    </Button>
                  </div>
                </template>
              </CuiChartTable>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="storage">
          <div class="flex flex-col gap-6">
            <div v-if="stats && stats.paused === true" class="cui-banner cui-banner-error">
              <i-mdi:alert-circle-outline class="shrink-0 w-5 h-5" />
              <span>{{ $t('views.metrics.disk_critical') }}</span>
            </div>
            <div v-else-if="stats && stats.diskFreePercent > 0 && stats.diskFreePercent < 8" class="cui-banner cui-banner-warn">
              <i-mdi:alert-outline class="shrink-0 w-5 h-5" />
              <span>{{ $t('views.metrics.disk_warning') }}</span>
            </div>

            <div v-if="stats && stats.smallVolume" class="cui-banner cui-banner-warn">
              <i-mdi:alert-outline class="shrink-0 w-5 h-5" />
              <span>{{ $t('views.metrics.disk_small_volume') }}</span>
            </div>

            <div>
              <span class="card-title">{{ $t('views.metrics.storage_overview') }}</span>
              <Card class="cui-card">
                <template #content>
                  <div v-if="storageStatsLoading && !stats" class="flex items-center justify-center py-8">
                    <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                  </div>
                  <div v-else-if="!stats" class="text-sm text-muted text-center py-8">
                    {{ $t('views.metrics.storage_not_available') }}
                  </div>
                  <div v-else class="flex flex-col sm:flex-row items-center gap-6">
                    <div class="shrink-0" style="width: 180px; height: 180px">
                      <Doughnut :data="storageChartData" :options="storageChartOptions" />
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
              <span class="card-title">{{ $t('views.metrics.camera_storage') }}</span>
              <Card class="cui-card">
                <template #content>
                  <div v-if="storageStatsLoading && !stats" class="flex items-center justify-center py-8">
                    <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                  </div>
                  <div v-else-if="!stats" class="text-sm text-muted text-center py-8">
                    {{ $t('views.metrics.storage_not_available') }}
                  </div>
                  <CuiDataTable v-else :value="cameraRows" :pt="tablePtOptions" striped-rows scrollable>
                    <Column field="status" :header="''" header-class="p-2! w-5 max-w-5" class="p-2! w-5 max-w-5">
                      <template #body="{ data }">
                        <div class="flex items-center">
                          <Badge
                            v-tooltip="{ value: data.isRecording ? $t('views.metrics.status_recording') : $t('views.metrics.status_stopped') }"
                            :style="{ background: data.isRecording ? 'green' : 'gray' }"
                          />
                        </div>
                      </template>
                    </Column>
                    <Column field="name" :header="$t('views.metrics.col_camera')" header-class="w-56 min-w-56 max-w-56" class="w-56 min-w-56 max-w-56">
                      <template #body="{ data }">
                        <span class="font-bold text-color block whitespace-normal break-all hyphens-auto">{{ data.name }}</span>
                      </template>
                    </Column>
                    <Column field="size" :header="$t('views.metrics.col_size')">
                      <template #body="{ data }">
                        {{ formatBytes(data.usedBytes) }}
                      </template>
                    </Column>
                    <Column field="daysCount" :header="$t('views.metrics.col_days')" />
                    <Column field="rate" :header="$t('views.metrics.col_rate')">
                      <template #body="{ data }">
                        {{ data.bandwidthMBh > 0 ? formatRate(data.bandwidthMBh) : '-' }}
                      </template>
                    </Column>
                    <Column field="recordingMode" :header="$t('views.metrics.col_mode')">
                      <template #body="{ data }">
                        <Chip :label="data.recordingMode" class="text-xs" />
                      </template>
                    </Column>
                    <template #empty>
                      <span class="text-muted text-sm">{{ $t('views.metrics.no_cameras') }}</span>
                    </template>
                  </CuiDataTable>
                </template>
              </Card>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { useStorageStats } from '@camera.ui/nvr';
import { PLUGIN_STATUS, RUNTIME_STATUS } from '@shared/types';
import { ArcElement, Chart as ChartJS, DoughnutController, Tooltip } from 'chart.js';
import { Doughnut } from 'vue-chartjs';
import RestartIcon from '~icons/ic/round-restart-alt';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { FrameWorkerQuery } from '@/api/routes/frameWorkers.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { ServerQuery } from '@/api/routes/server.js';
import { isHeaderChart } from '@/components/CuiChartTable/types.js';
import BenchmarkDialog from '@/components/CuiDialog/templates/DetectionBenchmark/DetectionBenchmark.vue';
import { DEFAULT_PROCESS_LOAD, MAX_METRICS_DATA_POINTS } from '@/composables/sockets/useMetricsSocket.js';

import type { TableHeader, TableHeaderChart } from '@/components/CuiChartTable/types.js';
import type { PaginationQuery, ProcessInfo, StreamStatsRow } from '@shared/types';
import type { ChartData, ChartOptions } from 'chart.js';
import type { DataTablePassThroughOptions } from 'primevue';

ChartJS.register(DoughnutController, ArcElement, Tooltip);

interface CameraStorageRow {
  id: string;
  name: string;
  usedBytes: number;
  daysCount: number;
  bandwidthMBh: number;
  recordingMode: string;
  isRecording: boolean;
}

interface OverviewRow {
  label: string;
  value: string;
}

const camerasQuery = new CamerasQuery();
const pluginsQuery = new PluginsQuery();
const frameWorkerQuery = new FrameWorkerQuery();
const serverQuery = new ServerQuery();

const { t } = useI18n();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { copy } = useClipboard();
const metricsSocket = useMetricsSocket();
const { mdBreakpoint, smBreakpoint, xsBreakpoint } = useSharedCuiBreakpoint();
const { beginServerRestart } = useServerRestart();
const { stats, isLoading: storageStatsLoading } = useStorageStats();

const METRICS_TABS = ['overview', 'cameras', 'storage'];

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

const containerRef = useTemplateRef('containerRef');
const currentTab = ref('overview');
const showInference = ref(false);
const showStreams = ref(false);
const tablePages = ref({ frameworker: 1, plugins: 1, streams: 1 });
const frameworkersPagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });
const pluginsPagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });
const frameWorkersRestarting = ref<string[]>([]);
const pluginsRestarting = ref<string[]>([]);

const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: plugins, isBusy: pluginsLoading, suspense: pluginsSuspense } = pluginsQuery.getPluginsQuery(pluginsPagination);
const { data: frameWorkers, isBusy: frameWorkersLoading, suspense: frameWorkerSuspense } = frameWorkerQuery.getFrameWorkersQuery(frameworkersPagination);
const { mutateAsync: restartPlugin } = pluginsQuery.restartPluginQuery();
const { mutateAsync: restartFrameWorker } = frameWorkerQuery.restartFrameWorkerQuery();
const { mutateAsync: resetFrameWorkerPerf, isPending: resetPerfLoading } = frameWorkerQuery.resetFrameWorkerPerfQuery();
const { mutate: restartGo2Rtc, isPending: restartGo2RtcLoading } = serverQuery.restartGo2RtcQuery();
const { mutate: restartServer, isPending: restartSystemLoading } = serverQuery.restartServerQuery();

useTabSwipe(containerRef, (swipeDirection) => {
  const index = METRICS_TABS.indexOf(currentTab.value);
  const nextTab = METRICS_TABS[swipeDirection === 'right' ? index - 1 : index + 1];
  if (nextTab) {
    currentTab.value = nextTab;
  }
});

const systemProcess = metricsSocket.systemProcess;
const systemProcessInfo = metricsSocket.systemProcessInfo;
const serverStatus = metricsSocket.serverStatus;
const go2rtcStatus = metricsSocket.go2rtcStatus;
const natsStatus = metricsSocket.natsStatus;
const coreProcesses = metricsSocket.coreProcesses;
const coreProcessInfos = metricsSocket.coreProcessInfos;
const frameWorkerStatus = metricsSocket.frameWorkerStatus;
const frameWorkersProcess = metricsSocket.frameWorkersProcess;
const frameWorkersProcessInfos = metricsSocket.frameWorkersProcessInfos;
const pluginsStatus = metricsSocket.pluginsStatus;
const pluginsProcesses = metricsSocket.pluginsProcesses;
const pluginsProcessInfos = metricsSocket.pluginsProcessInfos;
const streamStats = metricsSocket.streamStats;

const headers = computed<(type: 'system' | 'core' | 'frameworker' | 'plugins') => TableHeader[]>(() => {
  return (type) => {
    let headersObj: TableHeader[] = [
      {
        type: 'indicator',
        field: 'status',
        columnProps: {
          alignFrozen: 'left',
          frozen: !mdBreakpoint.value,
          headerClass: 'w-5 max-w-5',
          class: 'w-5 max-w-5',
        },
        color(item: ProcessInfo) {
          return getStatusColor(getStatus(type, item.name));
        },
        tooltip(item: ProcessInfo) {
          return getStatusText(getStatus(type, item.name));
        },
      },
      {
        type: 'category',
        field: 'name',
        altName: type === 'system' ? t('components.process_table.system') : undefined,
        name: t('components.process_table.title_name'),
        columnProps: {
          alignFrozen: 'left',
          frozen: !mdBreakpoint.value,
          headerClass: 'w-56 min-w-56 max-w-56',
          class: 'w-56 min-w-56 max-w-56',
        },
        props: {
          class: 'font-bold text-color',
        },
        badge: (item: ProcessInfo) => item.worker,
        badgeTooltip: (item: ProcessInfo) => (item.worker ? t('views.metrics.tip_worker', { name: item.worker }) : undefined),
      },
      {
        type: 'category',
        field: 'pid',
        name: t('components.process_table.title_pid'),
        columnProps: {
          headerClass: 'min-w-20',
          class: 'min-w-20',
        },
      },
      {
        type: 'category',
        field: 'cpuLoad',
        suffix: '%',
        name: t('components.process_table.title_cpu'),
        asChip: true,
        columnProps: {
          headerClass: 'min-w-30',
          class: 'min-w-30',
        },
      },
      {
        type: 'chart',
        field: 'cpu_chart',
        for: 'cpuLoad',
        columnProps: {
          headerClass: 'min-w-[250px]',
          class: 'min-w-[250px]',
        },
      },
      {
        type: 'category',
        field: 'memLoad',
        suffix: '%',
        name: t('components.process_table.title_memory'),
        asChip: true,
        columnProps: {
          headerClass: 'min-w-30',
          class: 'min-w-30',
        },
      },
      {
        type: 'chart',
        field: 'memory_chart',
        for: 'memLoad',
        columnProps: {
          headerClass: 'min-w-[250px]',
          class: 'min-w-[250px]',
        },
      },
      {
        type: 'action',
        field: 'restart',
        icon: RestartIcon,
        columnProps: {
          class: 'text-right',
        },
        loading(item: ProcessInfo) {
          if (type === 'core') {
            return item.name === 'camera.ui' ? restartSystemLoading.value : restartGo2RtcLoading.value;
          }

          if (type === 'frameworker') {
            return frameWorkerRestarting.value(item.name);
          }

          if (type === 'plugins') {
            return pluginRestarting.value(item.name);
          }

          return false;
        },
        disabled(item: ProcessInfo) {
          return item.name === 'nats';
        },
        action(item: ProcessInfo) {
          if (item.type === 'core') {
            coreRestart(item.name as 'camera.ui' | 'go2rtc');
          }

          if (item.type === 'frameworker') {
            frameWorkerRestart(item.name);
          }

          if (item.type === 'plugin') {
            pluginRestart(item.name);
          }
        },
      },
    ];

    if (type === 'system') {
      headersObj = headersObj.filter((header) => header.field !== 'pid' && header.field !== 'restart' && header.field !== 'status');
    }

    return headersObj;
  };
});

const analysisItems = computed(() => frameworkerItems.value);

const analysisColumnProps = { headerClass: 'min-w-24', class: 'min-w-24' };
const analysisFirstColumnProps = { headerClass: 'min-w-24 pl-4', class: 'min-w-24 pl-4' };

const analysisCameraColumn = computed<TableHeader>(() => ({
  type: 'category',
  field: 'name',
  name: t('views.metrics.col_camera'),
  columnProps: {
    alignFrozen: 'left',
    frozen: !mdBreakpoint.value,
    headerClass: 'w-56 min-w-56 max-w-56',
    class: 'w-56 min-w-56 max-w-56',
  },
  props: { class: 'font-bold text-color' },
  badge: (item: ProcessInfo) => item.worker,
  badgeTooltip: (item: ProcessInfo) => (item.worker ? t('views.metrics.tip_worker', { name: item.worker }) : undefined),
}));

const analysisInferenceHeaders = computed<TableHeader[]>(() => {
  const inferenceColumn = (type: string, name: string, info: string, first = false): TableHeader => ({
    type: 'category',
    field: (item: ProcessInfo) => ms(detector(item, type)?.inferenceMs),
    name,
    headerTooltip: info,
    columnProps: first ? analysisFirstColumnProps : analysisColumnProps,
    tooltip: (item: ProcessInfo) => detectorTooltip(item, type),
  });

  return [
    inferenceColumn('motion', t('views.metrics.col_motion'), t('views.metrics.info_motion'), true),
    inferenceColumn('object', t('views.metrics.col_object'), t('views.metrics.info_object')),
    inferenceColumn('face', t('views.metrics.col_face'), t('views.metrics.info_secondary')),
    inferenceColumn('licensePlate', t('views.metrics.col_plate'), t('views.metrics.info_secondary')),
    inferenceColumn('classifier', t('views.metrics.col_classifier'), t('views.metrics.info_secondary')),
    inferenceColumn('clip', t('views.metrics.col_clip'), t('views.metrics.info_secondary')),
  ];
});

const analysisPerformanceHeaders = computed<TableHeader[]>(() => {
  return [
    {
      type: 'category',
      field: (item: ProcessInfo) => `${ms(item.perf?.decodeMs)} / ${ms(item.perf?.mainDecodeMs)}`,
      name: t('views.metrics.col_decode'),
      headerTooltip: t('views.metrics.info_decode'),
      columnProps: analysisFirstColumnProps,
      tooltip: () => `${t('views.metrics.tip_analysis_stream')} / ${t('views.metrics.tip_main')}`,
    },
    {
      type: 'category',
      field: (item: ProcessInfo) => ms(item.perf?.processingMs),
      name: t('views.metrics.col_processing'),
      headerTooltip: t('views.metrics.info_processing'),
      columnProps: analysisColumnProps,
      tooltip: (item: ProcessInfo) =>
        [
          `${t('views.metrics.tip_scale')}: ${ms(item.perf?.scaleMs)}`,
          `${t('views.metrics.tip_post')}: ${ms(item.perf?.postMs)}`,
          `${t('views.metrics.tip_motion_scale')}: ${ms(item.perf?.motionScaleMs)}`,
        ].join(' · '),
    },
    {
      type: 'category',
      field: (item: ProcessInfo) => ms(item.perf?.transportMs),
      name: t('views.metrics.col_transport'),
      headerTooltip: t('views.metrics.info_transport'),
      columnProps: analysisColumnProps,
    },
    {
      type: 'category',
      field: (item: ProcessInfo) => `${fps(item.perf?.analysedFps)} / ${fps(item.perf?.mainFps)}`,
      name: t('views.metrics.col_analysed'),
      headerTooltip: t('views.metrics.info_analysed'),
      columnProps: analysisColumnProps,
      tooltip: () => `${t('views.metrics.tip_analysis_stream')} / ${t('views.metrics.tip_main')}`,
    },
    {
      type: 'category',
      field: (item: ProcessInfo) => (item.perf ? item.perf.objectsPerFrame.toFixed(1) : '-'),
      name: t('views.metrics.col_detections'),
      headerTooltip: t('views.metrics.info_detections'),
      columnProps: analysisColumnProps,
      tooltip: (item: ProcessInfo) => `${t('views.metrics.tip_hit_rate')}: ${item.perf ? `${item.perf.hitPercent}%` : '-'}`,
    },
    {
      type: 'category',
      field: (item: ProcessInfo) => (item.perf ? `${item.perf.zoomPercent}%` : '-'),
      name: t('views.metrics.col_zoom'),
      headerTooltip: t('views.metrics.info_zoom'),
      columnProps: analysisColumnProps,
      tooltip: (item: ProcessInfo) => `${t('views.metrics.tip_zoom_windows')}: ${item.perf && item.perf.zoomWindows > 0 ? item.perf.zoomWindows.toFixed(1) : '-'}`,
    },
    {
      type: 'category',
      field: (item: ProcessInfo) => (item.perf ? `${item.perf.activePercent}%` : '-'),
      name: t('views.metrics.col_active'),
      headerTooltip: t('views.metrics.info_active'),
      columnProps: analysisColumnProps,
    },
  ];
});

const streamHeaders = computed<TableHeader[]>(() => [
  {
    type: 'category',
    field: 'cameraName',
    name: t('views.metrics.col_camera'),
    columnProps: {
      alignFrozen: 'left',
      frozen: !mdBreakpoint.value,
      headerClass: 'w-56 min-w-56 max-w-56',
      class: 'w-56 min-w-56 max-w-56',
    },
    props: { class: 'font-bold text-color' },
  },
  { type: 'category', field: 'sourceName', name: t('views.metrics.col_source'), columnProps: analysisFirstColumnProps },
  {
    type: 'category',
    field: 'connections',
    name: t('views.metrics.col_connections'),
    headerTooltip: t('views.metrics.info_connections'),
    columnProps: analysisColumnProps,
  },
  {
    type: 'category',
    field: (item: StreamStatsRow) => bitrate(item.bitrateIn),
    name: t('views.metrics.col_bitrate_in'),
    headerTooltip: t('views.metrics.info_bitrate_in'),
    columnProps: analysisColumnProps,
  },
  {
    type: 'category',
    field: (item: StreamStatsRow) => bitrate(item.bitrateOut),
    name: t('views.metrics.col_bitrate_out'),
    headerTooltip: t('views.metrics.info_bitrate_out'),
    columnProps: analysisColumnProps,
  },
  {
    type: 'category',
    field: 'drops',
    name: t('views.metrics.col_drops'),
    headerTooltip: t('views.metrics.info_drops'),
    columnProps: analysisColumnProps,
  },
]);

const analysisHeaders = computed<TableHeader[]>(() => [
  analysisCameraColumn.value,
  ...(showInference.value ? analysisInferenceHeaders.value : analysisPerformanceHeaders.value),
]);

function ms(value?: number): string {
  return value && value > 0 ? `${value.toFixed(1)} ms` : '-';
}

function bitrate(bitsPerSecond: number): string {
  if (bitsPerSecond <= 0) return '-';
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbit/s`;
  return `${Math.round(bitsPerSecond / 1_000)} kbit/s`;
}

function fps(value?: number): string {
  return value && value > 0 ? value.toFixed(1) : '-';
}

function detector(item: ProcessInfo, type: string) {
  return item.perf?.detectors?.[type];
}

function detectorTooltip(item: ProcessInfo, type: string): string {
  const info = detector(item, type);
  if (!info) return t('views.metrics.tip_no_plugin');

  const models = (info.models ?? []).map((model) => [model.name, model.role, model.device].filter(Boolean).join(' '));
  const parts = [info.plugin, info.input, info.runtime, ...models];
  if (!info.stamped) parts.push(t('views.metrics.tip_round_trip'));
  return parts.filter(Boolean).join(' · ');
}

async function copyCameras() {
  const processHeaders = headers.value('frameworker').filter((header) => header.type === 'category' && header.field !== 'name');
  const sourceHeaders = streamHeaders.value.slice(2);

  const names = [...new Set([...frameworkerItems.value.map((item) => item.name), ...streamStats.value.map((row) => row.cameraName)])];

  const text = names
    .map((name) => {
      const item = frameworkerItems.value.find((process) => process.name === name);
      const title = item?.worker ? `${name} (${item.worker})` : name;
      const processLines = item
        ? processHeaders.map((header) => `  ${header.name}: ${cellValue(header, item)}${header.type === 'category' && header.suffix ? header.suffix : ''}`)
        : [];
      const sourceLines = streamStats.value
        .filter((row) => row.cameraName === name)
        .flatMap((row) => [`  ${row.sourceName}:`, ...sourceHeaders.map((header) => `    ${header.name}: ${cellValue(header, row)}`)]);
      return [title, ...processLines, ...sourceLines].join('\n');
    })
    .join('\n\n');

  await copy(text);
  toast.add({ severity: 'success', detail: t('views.metrics.copied'), life: 3000 });
}

function cellValue(header: TableHeader, item: object): string {
  const value = typeof header.field === 'function' ? header.field(item) : (item as Record<string, unknown>)[header.field];
  return String(value ?? '-');
}

async function copyAnalysis() {
  const sections = [
    { title: t('views.metrics.performance'), headers: analysisPerformanceHeaders.value },
    { title: t('views.metrics.inference'), headers: analysisInferenceHeaders.value },
  ];

  const text = analysisItems.value
    .map((item) => {
      const name = item.worker ? `${item.name} (${item.worker})` : item.name;
      const lines = sections.flatMap(({ title, headers }) => [
        `${title}:`,
        ...headers.map((header) => `  ${header.name}: ${typeof header.field === 'function' ? header.field(item) : ((item as any)[header.field] ?? '-')}`),
      ]);
      return [name, ...lines].join('\n');
    })
    .join('\n\n');

  await copy(text);
  toast.add({ severity: 'success', detail: t('views.metrics.copied'), life: 3000 });
}

function confirmReset() {
  dialog.openTextDialog({
    data: {
      title: t('views.metrics.reset'),
      contentText: t('views.metrics.reset_confirm'),
      confirmText: t('views.metrics.reset'),
      awaitConfirm: true,
    },
    onConfirm: async () => {
      await resetFrameWorkerPerf();
    },
  });
}

function openBenchmark() {
  dialog.openComponentDialog(BenchmarkDialog, {
    data: {
      title: t('views.metrics.benchmark'),
      confirmText: t('views.metrics.benchmark_start'),
      cancelText: t('components.form.button.close'),
      contentProps: { cameras: analysisItems.value.filter((item) => item.perf?.detectors?.object).map((item) => item.name) },
    },
  });
}

const systemItems = computed(() => systemProcess.value);
const coreItems = computed(() => Object.values(coreProcesses.value).filter(Boolean));
const frameworkerItems = computed(() => Object.values(frameWorkersProcess.value).filter(Boolean));
const pluginItems = computed(() =>
  Object.values(pluginsProcesses.value)
    .filter((item) => {
      const plugin = plugins.value?.result.find((p) => p.pluginName === item.name);
      return plugin && !plugin.disabled;
    })
    .filter(Boolean),
);

const systemChartData = computed(() => buildChartData('system', { system: systemProcessInfo.value }));
const coreChartData = computed(() => buildChartData('core', coreProcessInfos.value as unknown as Record<string, ProcessInfo[]>));
const frameworkerChartData = computed(() => buildChartData('frameworker', frameWorkersProcessInfos.value));
const pluginsChartData = computed(() => buildChartData('plugins', pluginsProcessInfos.value));

const pluginRestarting = computed<(pluginName: string) => boolean>(() => {
  return (pluginName: string) => {
    return pluginsRestarting.value.includes(pluginName);
  };
});

const frameWorkerRestarting = computed<(frameWorkerName: string) => boolean>(() => {
  return (frameWorkerName: string) => {
    return frameWorkersRestarting.value.includes(frameWorkerName);
  };
});

const cameraNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const cam of camerasData.value?.result ?? []) {
    map.set(cam._id, cam.name);
  }
  return map;
});

const cameraRows = computed<CameraStorageRow[]>(() => {
  if (!stats.value?.cameras) return [];
  return Object.entries(stats.value.cameras)
    .map(([id, cam]) => ({
      id,
      name: cameraNameMap.value.get(id) || id,
      usedBytes: cam.usedBytes,
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
    { label: t('views.metrics.disk_total'), value: formatGB(stats.value.diskTotalGB) },
    { label: t('views.metrics.nvr_usage'), value: formatGB(stats.value.nvrUsedGB) },
    { label: t('views.metrics.quota'), value: stats.value.nvrQuotaGB > 0 ? formatGB(stats.value.nvrQuotaGB) : t('views.metrics.unlimited') },
    {
      label: t('views.metrics.retention'),
      value: stats.value.retentionDays > 0 ? t('views.metrics.days_count', { count: stats.value.retentionDays }) : t('views.metrics.unlimited'),
    },
    { label: t('views.metrics.disk_free'), value: `${formatGB(stats.value.diskFreeGB)} (${stats.value.diskFreePercent.toFixed(1)}%)` },
  ];
});

const storageChartData = computed<ChartData<'doughnut'>>(() => {
  const nvrUsed = stats.value?.nvrUsedGB ?? 0;
  const diskFree = stats.value?.diskFreeGB ?? 0;
  const otherUsed = Math.max(0, (stats.value?.diskUsedGB ?? 0) - nvrUsed);
  const isEmpty = nvrUsed === 0 && otherUsed === 0 && diskFree === 0;

  return {
    labels: [t('views.metrics.chart_nvr'), t('views.metrics.chart_other'), t('views.metrics.chart_free')],
    datasets: [
      {
        data: isEmpty ? [0, 0, 1] : [nvrUsed, otherUsed, diskFree],
        backgroundColor: ['#df2a4c', 'rgba(223,42,76,0.35)', 'rgba(223,42,76,0.10)'],
        borderWidth: 0,
      },
    ],
  };
});

const storageChartOptions = computed<ChartOptions<'doughnut'>>(() => ({
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

function buildChartData(type: 'system' | 'core' | 'frameworker' | 'plugins', processMap: Record<string, ProcessInfo[]>): Record<string, ChartData<'bar'>> {
  return Object.keys(processMap).reduce((acc: Record<string, ChartData<'bar'>>, key) => {
    const chartsToProcess = headers.value(type).filter(isHeaderChart) as TableHeaderChart[];

    chartsToProcess.forEach((chart) => {
      const valueKey = chart.for as keyof ProcessInfo;
      const processData = processMap[key]
        .slice(-MAX_METRICS_DATA_POINTS)
        .filter((info) => info[valueKey] !== undefined)
        .map((info) => parseFloat(info[valueKey] as string));
      const timestamps = processMap[key].slice(-MAX_METRICS_DATA_POINTS).map((info) => info.timestamp);
      const data = [...processData, ...Array(MAX_METRICS_DATA_POINTS - processData.length).fill(0)];
      const labels = [...timestamps, ...Array(MAX_METRICS_DATA_POINTS - timestamps.length).fill(null)];

      acc[`${key}_${valueKey}`] = {
        labels,
        datasets: [
          {
            data,
            backgroundColor: (context) => {
              const value = context.raw as number;
              if (value >= 90) return '#FA5252';
              if (value >= 70) return '#FF9966';
              return '#df2a4c';
            },
            borderWidth: 0,
            borderRadius: 3,
            barPercentage: 0.8,
            categoryPercentage: 0.8,
            maxBarThickness: 4,
            barThickness: 4,
          },
        ],
      };
    });

    return acc;
  }, {});
}

function onPage(e: { page: number; rows: number; first: number }, type: 'frameworker' | 'plugins' | 'streams') {
  tablePages.value[type] = e.page + 1;
}

function getStatus(type: 'system' | 'core' | 'frameworker' | 'plugins', name: string): RUNTIME_STATUS | PLUGIN_STATUS {
  if (type === 'core') {
    switch (name) {
      case 'camera.ui':
        return serverStatus.value;
      case 'go2rtc':
        return go2rtcStatus.value;
      case 'nats':
        return natsStatus.value;
      default:
        return RUNTIME_STATUS.UNKNOWN;
    }
  } else if (type === 'frameworker') {
    return frameWorkerStatus.value[name]?.status ?? PLUGIN_STATUS.UNKNOWN;
  } else if (type === 'plugins') {
    return pluginsStatus.value[name]?.status ?? PLUGIN_STATUS.UNKNOWN;
  }

  return RUNTIME_STATUS.UNKNOWN;
}

function getStatusColor(status: RUNTIME_STATUS | PLUGIN_STATUS): string {
  switch (status) {
    case PLUGIN_STATUS.ERROR:
    case RUNTIME_STATUS.ERROR:
      return '#9d5752';
    case RUNTIME_STATUS.STOPPED:
    case PLUGIN_STATUS.STOPPED:
    case PLUGIN_STATUS.STOPPING:
      return 'red';
    case PLUGIN_STATUS.READY:
    case RUNTIME_STATUS.READY:
      return 'yellow';
    case PLUGIN_STATUS.STARTING:
    case RUNTIME_STATUS.STARTING:
      return 'orange';
    case PLUGIN_STATUS.STARTED:
    case RUNTIME_STATUS.STARTED:
      return 'green';
    case PLUGIN_STATUS.UNKNOWN:
    case PLUGIN_STATUS.DISABLED:
    case RUNTIME_STATUS.UNKNOWN:
      return 'gray';
    default:
      return 'gray';
  }
}

function getStatusText(status: RUNTIME_STATUS | PLUGIN_STATUS): string {
  switch (status) {
    case PLUGIN_STATUS.ERROR:
    case RUNTIME_STATUS.ERROR:
      return t('components.process_table.status_error');
    case PLUGIN_STATUS.STOPPED:
    case RUNTIME_STATUS.STOPPED:
      return t('components.process_table.status_stopped');
    case PLUGIN_STATUS.STOPPING:
      return t('components.process_table.status_stopping');
    case PLUGIN_STATUS.READY:
    case RUNTIME_STATUS.READY:
      return t('components.process_table.status_ready');
    case PLUGIN_STATUS.STARTING:
    case RUNTIME_STATUS.STARTING:
      return t('components.process_table.status_starting');
    case PLUGIN_STATUS.STARTED:
    case RUNTIME_STATUS.STARTED:
      return t('components.process_table.status_started');
    case PLUGIN_STATUS.DISABLED:
      return t('components.process_table.status_disabled');
    case PLUGIN_STATUS.UNKNOWN:
    case RUNTIME_STATUS.UNKNOWN:
      return t('components.process_table.status_unknown');
    default:
      return t('components.process_table.status_unknown');
  }
}

async function coreRestart(target: 'camera.ui' | 'go2rtc'): Promise<void> {
  if (target === 'camera.ui') {
    beginServerRestart();
    restartServer();
  } else if (target === 'go2rtc') {
    restartGo2Rtc();
  }
}

async function frameWorkerRestart(frameWorkerName: string): Promise<void> {
  frameWorkersRestarting.value.push(frameWorkerName);
  try {
    await restartFrameWorker({ frameWorkerName });
  } catch {
    // Error surfaces via the mutation's observer-level handlers (toast, etc.)
  } finally {
    frameWorkersRestarting.value = frameWorkersRestarting.value.filter((frameWorker) => frameWorker !== frameWorkerName);
  }
}

async function pluginRestart(pluginName: string): Promise<void> {
  pluginsRestarting.value.push(pluginName);
  try {
    await restartPlugin({ pluginName });
  } catch {
    // Error surfaces via the mutation's observer-level handlers (toast, etc.)
  } finally {
    pluginsRestarting.value = pluginsRestarting.value.filter((plugin) => plugin !== pluginName);
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
  frameWorkersProcessInfos,
  (newValues) => {
    for (const [name, processInfo] of Object.entries(newValues)) {
      frameWorkersProcess.value[name] = processInfo[processInfo.length - 1] ?? {
        ...DEFAULT_PROCESS_LOAD,
        name,
        type: 'frameworker',
      };
    }
  },
  { deep: true, immediate: true },
);

watch(
  pluginsProcessInfos,
  (newValues) => {
    for (const [name, processInfo] of Object.entries(newValues)) {
      pluginsProcesses.value[name] = processInfo[processInfo.length - 1] ?? {
        ...DEFAULT_PROCESS_LOAD,
        name,
        type: 'plugin',
      };
    }
  },
  { deep: true, immediate: true },
);

watch(
  frameWorkers,
  (workers) => {
    if (workers) {
      for (const frameWorker of workers.result) {
        if (!frameWorkersProcessInfos.value[frameWorker.name]) {
          frameWorkersProcessInfos.value[frameWorker.name] = [];
        }
        if (!frameWorkerStatus.value[frameWorker.name]) {
          frameWorkerStatus.value[frameWorker.name] = {
            name: frameWorker.name,
            status: PLUGIN_STATUS.UNKNOWN,
          };
        }
      }
    }
  },
  { deep: true, immediate: true },
);

watch(
  plugins,
  (workers) => {
    if (workers) {
      for (const plugin of workers.result) {
        if (plugin.disabled) continue;
        if (!pluginsProcessInfos.value[plugin.pluginName]) {
          pluginsProcessInfos.value[plugin.pluginName] = [];
        }
        if (!pluginsStatus.value[plugin.pluginName]) {
          pluginsStatus.value[plugin.pluginName] = {
            name: plugin.pluginName,
            status: PLUGIN_STATUS.UNKNOWN,
          };
        }
      }
    }
  },
  { deep: true, immediate: true },
);

onBeforeMount(async () => {
  metricsSocket.connect();

  await Promise.all([pluginsSuspense(), frameWorkerSuspense()]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  metricsSocket.loadAll();
});

onUnmounted(() => {
  metricsSocket.disconnect();
});
</script>

<style scoped>
.metrics-tabs :deep(.p-tablist),
.metrics-tabs :deep(.p-tablist-content) {
  background: transparent;
}

.metrics-tabs :deep(.p-tablist-tab-list) {
  background: var(--p-card-background);
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 0.375rem;
  gap: 0.25rem;
}

.metrics-tabs :deep(.p-tab) {
  padding: 0.5rem 1rem;
  margin: 0;
  border-width: 0;
  border-radius: 0.5rem;
}

.metrics-tabs :deep(.p-tab-active) {
  background: var(--p-content-hover-background);
}

.metrics-tabs :deep(.p-tablist-active-bar) {
  display: none;
}
</style>
