<template>
  <div>
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

    <div class="flex flex-col gap-6">
      <div>
        <span class="card-title">{{ $t('views.adminpanel.general') }}</span>
        <CuiChartTable :items="systemItems" :headers="headers('system')" :chart-data="systemChartData" :empty-message="$t('views.adminpanel.no_system')" />
      </div>

      <div>
        <span class="card-title">{{ $t('views.adminpanel.core') }}</span>
        <CuiChartTable :items="coreItems" :headers="headers('core')" :chart-data="coreChartData" :empty-message="$t('views.adminpanel.no_core')" />
      </div>

      <div>
        <span class="card-title">{{ $t('views.adminpanel.frameworker') }}</span>
        <CuiChartTable
          :items="frameworkerItems"
          :headers="headers('frameworker')"
          :chart-data="frameworkerChartData"
          :loading="frameWorkersLoading"
          :empty-message="$t('views.adminpanel.no_frameworkers')"
        />
      </div>

      <div>
        <span class="card-title">{{ $t('views.adminpanel.plugins') }}</span>
        <CuiChartTable
          :items="pluginItems"
          :headers="headers('plugins')"
          :chart-data="pluginsChartData"
          :loading="pluginsLoading"
          :empty-message="$t('views.adminpanel.no_plugins')"
        />
      </div>

      <div>
        <span class="card-title">{{ $t('views.adminpanel.logged_in_users') }}</span>
        <CuiChartTable
          :items="users"
          :headers="userHeaders"
          :loading="tokensLoading"
          paginator
          :pagination="userPagination"
          :total-records="users.length"
          :empty-message="$t('views.adminpanel.no_users')"
          @update:page="onPage($event, 'users')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PLUGIN_STATUS, RUNTIME_STATUS } from '@shared/types';
import LogoutIcon from '~icons/ant-design/logout-outlined';
import RestartIcon from '~icons/ic/round-restart-alt';

import { AuthQuery } from '@/api/routes/auth.js';
import { FrameWorkerQuery } from '@/api/routes/frameWorkers.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { ServerQuery } from '@/api/routes/server.js';
import { isHeaderChart } from '@/components/CuiChartTable/types.js';
import { DEFAULT_PROCESS_LOAD, MAX_METRICS_DATA_POINTS } from '@/composables/sockets/useMetricsSocket.js';

import type { TableHeader, TableHeaderChart } from '@/components/CuiChartTable/types.js';
import type { PaginationQuery, ProcessInfo, SessionInfo } from '@shared/types';
import type { ChartData } from 'chart.js';

const authQuery = new AuthQuery();
const pluginsQuery = new PluginsQuery();
const frameWorkerQuery = new FrameWorkerQuery();
const serverQuery = new ServerQuery();

const { t } = useI18n();
const metricsSocket = useMetricsSocket();
const { mdBreakpoint, smBreakpoint } = useSharedCuiBreakpoint();
const { beginServerRestart } = useServerRestart();

const userPagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });
const frameworkersPagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });
const pluginsPagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });

const { data: userSessions, isBusy: tokensLoading } = authQuery.listAllSessionsQuery(userPagination);
const { data: plugins, isBusy: pluginsLoading, suspense: pluginsSuspense } = pluginsQuery.getPluginsQuery(pluginsPagination);
const { data: frameWorkers, isBusy: frameWorkersLoading, suspense: frameWorkerSuspense } = frameWorkerQuery.getFrameWorkersQuery(frameworkersPagination);
const { mutate: revokeSession, isPending: deleteTokenLoading } = authQuery.revokeSessionQuery();
const { mutateAsync: restartPlugin } = pluginsQuery.restartPluginQuery();
const { mutateAsync: restartFrameWorker } = frameWorkerQuery.restartFrameWorkerQuery();
const { mutate: restartGo2Rtc, isPending: restartGo2RtcLoading } = serverQuery.restartGo2RtcQuery();
const { mutate: restartServer, isPending: restartSystemLoading } = serverQuery.restartServerQuery();

const frameWorkersRestarting = ref<string[]>([]);
const pluginsRestarting = ref<string[]>([]);

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

const userHeaders = computed<TableHeader[]>(() => {
  return [
    {
      type: 'indicator',
      field: 'status',
      columnProps: {
        alignFrozen: 'left',
        frozen: !mdBreakpoint.value,
        headerClass: 'w-5 max-w-5',
        class: 'w-5 max-w-5',
      },
      color(item: SessionInfo) {
        return item.is_current ? 'var(--primary-500)' : 'transparent';
      },
      tooltip(item: SessionInfo) {
        if (item.is_current) {
          return t('components.user_table.you');
        }
      },
    },
    {
      type: 'category',
      field: (item: SessionInfo) => item.device.name,
      name: t('components.user_table.title_device'),
      columnProps: {
        alignFrozen: 'left',
        frozen: !mdBreakpoint.value,
        headerClass: 'w-40 min-w-40 max-w-40',
        class: 'w-40 min-w-40 max-w-40',
      },
      props: {
        class: 'font-bold text-color',
      },
    },
    {
      type: 'category',
      field: (item: SessionInfo) => item.device.ip ?? '',
      name: t('components.user_table.title_address'),
      columnProps: {
        headerClass: 'min-w-30',
        class: 'min-w-30',
      },
    },
    {
      type: 'category',
      field: (item: SessionInfo) => item.device.kind,
      name: t('components.user_table.title_kind'),
      columnProps: {
        headerClass: 'min-w-30',
        class: 'min-w-30',
      },
    },
    {
      type: 'action',
      field: 'logout',
      icon: LogoutIcon,
      columnProps: {
        class: 'text-right',
      },
      loading() {
        return Boolean(deleteTokenLoading.value || tokensLoading.value);
      },
      disabled() {
        return false;
      },
      action(item: SessionInfo) {
        revokeSession({ id: item.id });
      },
    },
  ];
});

const users = computed(() => userSessions.value ?? []);

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
          headerClass: 'w-40 min-w-40 max-w-40',
          class: 'w-40 min-w-40 max-w-40',
        },
        props: {
          class: 'font-bold text-color',
        },
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

function onPage(e: { page: number; rows: number; first: number }, type: 'frameworker' | 'plugins' | 'users') {
  const page = e.page + 1;
  if (type === 'frameworker') {
    frameworkersPagination.value.page = page;
  } else if (type === 'plugins') {
    pluginsPagination.value.page = page;
  } else if (type === 'users') {
    userPagination.value.page = page;
  }
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

<style scoped></style>
