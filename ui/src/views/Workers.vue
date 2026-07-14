<template>
  <div>
    <h1 v-if="!smBreakpoint" class="page-title">{{ $t('views.workers.title') }}</h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div v-if="!workersLoaded || !isConnected" class="w-full h-full flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.workers.configuration') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div class="flex flex-row items-center justify-between gap-4">
                <div class="flex flex-col">
                  <span class="text-sm font-semibold text-color">{{ $t('views.workers.enable_workers') }}</span>
                  <span class="text-muted text-xs">{{ $t('views.workers.enable_workers_description') }}</span>
                </div>
                <ToggleSwitch :model-value="workersEnabled" :disabled="configSaving" class="shrink-0" @update:model-value="handleToggle" />
              </div>

              <template v-if="workersEnabled">
                <div class="flex flex-col field-gap">
                  <span class="text-sm font-semibold">{{ $t('views.workers.master_address') }}</span>
                  <Select
                    v-model="addressDraft"
                    :options="addressOptions"
                    editable
                    option-label="label"
                    option-value="value"
                    :placeholder="$t('views.workers.master_address_placeholder')"
                    class="w-full"
                  />
                  <span class="text-muted text-xs">{{ $t('views.workers.master_address_hint') }}</span>
                </div>

                <div class="flex flex-col field-gap">
                  <span class="text-sm font-semibold">{{ $t('views.workers.leaf_port') }}</span>
                  <InputNumber v-model="portDraft" :min="1024" :max="65535" :use-grouping="false" class="w-full" />
                  <span v-if="portChanged && (workersConfig?.pairedWorkers ?? 0) > 0" class="text-orange-400 text-xs">
                    {{ $t('views.workers.port_change_warning') }}
                  </span>
                </div>

                <div class="flex flex-row items-end justify-end">
                  <Button class="cui-button-medium" :label="$t('views.workers.save')" :loading="configSaving" :disabled="!configDirty" @click="handleSaveConfig" />
                </div>
              </template>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="workersEnabled">
        <span class="card-title">{{ $t('views.workers.workers') }}</span>
        <CuiChartTable v-if="workers.length" :items="workers" :headers="workerHeaders" :chart-data="workerChartData" />
        <Card v-else class="cui-card" :pt="{ root: { class: 'h-full' } }">
          <template #content>
            <div class="flex flex-col items-center justify-center gap-4 py-6">
              <i-icon-park-solid:circular-connection class="w-12 h-12 text-muted" />
              <span class="text-muted text-sm">{{ $t('views.workers.no_workers') }}</span>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="workersEnabled && workers.length">
        <span class="card-title">{{ $t('views.workers.camera_assignments') }}</span>
        <Card class="cui-card">
          <template #content>
            <p class="text-muted text-sm mb-4">{{ $t('views.workers.camera_assignments_description') }}</p>
            <CuiDataTable :value="cameras" :loading="camerasLoading" :pt="assignmentTablePt" striped-rows class="w-full">
              <template #loading>
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </template>
              <template #empty>
                <span class="text-muted text-sm">{{ $t('views.workers.no_cameras') }}</span>
              </template>

              <Column field="name" :header="$t('views.workers.camera')" header-class="p-2 min-w-40" class="p-2 min-w-40">
                <template #body="{ data }">
                  <span class="font-bold text-color text-sm">{{ data.name }}</span>
                </template>
              </Column>

              <Column :header="$t('views.workers.workers')" header-class="p-2 w-full" class="p-2 w-full">
                <template #body="{ data }">
                  <Select
                    :model-value="getValidAgentId(data.workerAgentId)"
                    :options="getWorkerOptions()"
                    option-label="label"
                    option-value="value"
                    :placeholder="$t('views.workers.local')"
                    class="w-full"
                    show-clear
                    :loading="isAssigning(data._id)"
                    :disabled="isAssigning(data._id)"
                    @update:model-value="(val: string | null) => handleAssignment(data, val)"
                  />
                </template>
              </Column>
            </CuiDataTable>
          </template>
        </Card>
      </div>

      <div v-if="workersEnabled && workers.length">
        <span class="card-title">{{ $t('views.workers.plugin_assignments') }}</span>
        <Card class="cui-card">
          <template #content>
            <p class="text-muted text-sm mb-4">{{ $t('views.workers.plugin_assignments_description') }}</p>
            <CuiDataTable :value="plugins" :loading="pluginsLoading" :pt="assignmentTablePt" striped-rows class="w-full">
              <template #loading>
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </template>
              <template #empty>
                <span class="text-muted text-sm">{{ $t('views.workers.no_plugins') }}</span>
              </template>

              <Column field="displayName" :header="$t('views.workers.plugin')" header-class="p-2 min-w-40" class="p-2 min-w-40">
                <template #body="{ data }">
                  <div class="flex flex-col">
                    <span class="font-bold text-color text-sm">{{ data.displayName }}</span>
                    <span v-if="platformRequirement(data)" class="text-muted text-xs">{{ platformRequirement(data) }}</span>
                  </div>
                </template>
              </Column>

              <Column :header="$t('views.workers.workers')" header-class="p-2 w-full" class="p-2 w-full">
                <template #body="{ data }">
                  <Select
                    :model-value="getValidAgentId(data.workerAgentId)"
                    :options="getPluginWorkerOptions(data)"
                    option-label="label"
                    option-value="value"
                    option-disabled="disabled"
                    :placeholder="$t('views.workers.local')"
                    class="w-full"
                    show-clear
                    :loading="isAssigningPlugin(data.pluginName)"
                    :disabled="isAssigningPlugin(data.pluginName)"
                    @update:model-value="(val: string | null) => handlePluginAssignment(data, val)"
                  />
                </template>
              </Column>
            </CuiDataTable>
          </template>
        </Card>
      </div>

      <div v-if="workersEnabled">
        <span class="card-title">{{ $t('views.workers.pair_worker') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.workers.pair_worker_description') }}</span>

              <template v-if="pairing">
                <div class="flex flex-col field-gap">
                  <span class="text-sm font-semibold">{{ $t('views.workers.pairing_code') }}</span>
                  <InputGroup>
                    <InputText :model-value="pairing.code" readonly type="text" />
                    <InputGroupAddon>
                      <CuiActionButton
                        :action-text="$t('views.workers.copied')"
                        :icon="CopyIcon"
                        :button-props="{
                          severity: 'secondary',
                          text: true,
                        }"
                        @action="copy(pairing!.code)"
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <span class="text-muted text-xs">{{ $t('views.workers.pairing_expires', { minutes: pairingMinutesLeft }) }}</span>
                </div>

                <div class="flex flex-col field-gap">
                  <div class="flex flex-row items-center justify-between">
                    <span class="text-sm font-semibold">{{ $t('views.workers.pairing_snippet') }}</span>
                    <CuiActionButton
                      :action-text="$t('views.workers.copied')"
                      :icon="CopyIcon"
                      :button-props="{
                        severity: 'secondary',
                        text: true,
                      }"
                      @action="copy(pairingSnippet)"
                    />
                  </div>
                  <pre class="pairing-snippet">{{ pairingSnippet }}</pre>
                  <span class="text-muted text-xs">{{ $t('views.workers.pairing_snippet_hint') }}</span>
                </div>
              </template>

              <div class="flex flex-row items-end justify-end">
                <Button class="cui-button-medium" :label="$t('views.workers.generate_code')" :loading="generatingCode" @click="handleCreatePairing" />
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/fluent/copy-16-filled';
import RestartIcon from '~icons/ic/round-restart-alt';
import RemoveIcon from '~icons/mdi/delete-outline';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { copyToClipboard as copy } from '@/common/utils.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { WorkersQuery } from '@/api/routes/workers.js';

import type { WorkerInfo, WorkerPairing } from '@/api/routes/workers.js';
import type { TableHeader } from '@/components/CuiChartTable/types.js';
import type { PassThrough } from '@primevue/core';
import type { CameraUiPlugin, DBCamera } from '@shared/types';
import type { ChartData } from 'chart.js';
import type { DataTablePassThroughOptions } from 'primevue';

const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const dialog = useCuiDialog();

const workersSocket = useWorkersSocket();
const { workers, workerHistory, isConnected } = workersSocket;

const camerasQuery = new CamerasQuery();
const pluginsQuery = new PluginsQuery();
const workersQuery = new WorkersQuery();

const { data: camerasData, isLoading: camerasLoading } = camerasQuery.getCamerasQuery(ref({ page: 1, pageSize: 999 }));
const { data: pluginsData, isLoading: pluginsLoading } = pluginsQuery.getPluginsQuery(ref({ page: 1, pageSize: 999 }));
const { data: workersConfig } = workersQuery.getConfigQuery();
const { mutateAsync: patchConfig, isPending: configSaving } = workersQuery.patchConfigQuery();
const { mutateAsync: assignCamera } = workersQuery.assignCameraQuery();
const { mutateAsync: unassignCamera } = workersQuery.unassignCameraQuery();
const { mutateAsync: restartWorkerMutation } = workersQuery.restartWorkerQuery();
const { mutateAsync: createPairing, isPending: generatingCode } = workersQuery.createPairingQuery();
const { mutateAsync: removeWorkerMutation } = workersQuery.removeWorkerQuery();
const { mutateAsync: assignPlugin } = workersQuery.assignPluginQuery();
const { mutateAsync: unassignPlugin } = workersQuery.unassignPluginQuery();

const assignmentTablePt: PassThrough<DataTablePassThroughOptions> = {
  bodyRow: {
    class: 'text-sm text-secondary',
  },
  column: {
    columnTitle: {
      class: 'text-sm font-semibold',
    },
  },
};

const workersLoaded = ref(false);
const workersRestarting = ref<string[]>([]);
const workersRemoving = ref<string[]>([]);
const assigningCameraIds = ref(new Set<string>());
const assigningPluginNames = ref(new Set<string>());
const pairing = ref<WorkerPairing | null>(null);
const addressDraft = ref('');
const portDraft = ref(7422);

const cameras = computed(() => camerasData.value?.result ?? []);
const plugins = computed(() => pluginsData.value?.result ?? []);
const workersEnabled = computed(() => workersConfig.value?.enabled ?? false);
const addressOptions = computed(() => (workersConfig.value?.suggestedAddresses ?? []).map((address) => ({ label: address, value: address })));
const portChanged = computed(() => portDraft.value !== (workersConfig.value?.port ?? 7422));
const configDirty = computed(() => addressDraft.value !== (workersConfig.value?.address ?? '') || portChanged.value);
const workerIds = computed(() => new Set(workers.value.map((w) => w.agentId)));

const pairingMinutesLeft = computed(() => {
  if (!pairing.value) return 0;
  return Math.max(0, Math.round((pairing.value.expiresAt - Date.now()) / 60_000));
});

const pairingSnippet = computed(() => {
  if (!pairing.value) return '';
  const master = pairing.value.address || '<MASTER_IP>';
  return [
    'worker:',
    `  master: ${master}`,
    `  apiPort: ${pairing.value.apiPort}`,
    `  pairingCode: ${pairing.value.code}`,
    '  name: my-worker',
    '  capabilities:',
    '    - frameDecoding',
    '    - pluginHost',
  ].join('\n');
});

const workerHeaders = computed<TableHeader[]>(() => [
  {
    type: 'indicator',
    field: 'status',
    columnProps: {
      headerClass: 'w-5 max-w-5',
      class: 'w-5 max-w-5',
    },
    color(item: WorkerInfo) {
      if (!item.online) return 'red';
      return item.versionMismatch ? 'orange' : 'green';
    },
    tooltip(item: WorkerInfo) {
      if (!item.online) return t('views.workers.offline');
      return item.versionMismatch ? t('views.workers.version_mismatch', { version: item.version || '?' }) : t('views.workers.online');
    },
  },
  {
    type: 'category',
    field: 'name',
    name: t('views.workers.name'),
    columnProps: {
      headerClass: 'w-40 min-w-40 max-w-40',
      class: 'w-40 min-w-40 max-w-40',
    },
    props: {
      class: 'font-bold text-color',
    },
  },
  {
    type: 'category',
    field: (item: WorkerInfo) => (item.platform ? `${item.platform.os}/${item.platform.arch}` : '—'),
    name: t('views.workers.platform'),
    asChip: true,
    columnProps: {
      headerClass: 'min-w-40',
      class: 'min-w-40',
    },
  },
  {
    type: 'category',
    field: (item: WorkerInfo) => item.pid?.toString() ?? '—',
    name: t('views.workers.pid'),
    columnProps: {
      headerClass: 'min-w-20',
      class: 'min-w-20',
    },
  },
  {
    type: 'category',
    field: (item: WorkerInfo) => (item.cpuLoad !== undefined ? `${item.cpuLoad}%` : '—'),
    name: t('views.workers.cpu'),
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
    field: (item: WorkerInfo) => (item.memLoad !== undefined ? `${item.memLoad}%` : '—'),
    name: t('views.workers.memory'),
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
    field: 'actions',
    columnProps: {
      class: 'text-right',
    },
    buttons: [
      {
        icon: RestartIcon,
        loading: (item: WorkerInfo) => workersRestarting.value.includes(item.name),
        disabled: (item: WorkerInfo) => !item.online,
        action: (item: WorkerInfo) => handleRestartWorker(item.name, item.agentId),
      },
      {
        icon: RemoveIcon,
        buttonProps: { severity: 'danger' },
        loading: (item: WorkerInfo) => workersRemoving.value.includes(item.agentId),
        action: (item: WorkerInfo) => handleRemoveWorker(item),
      },
    ],
  },
]);

const workerChartData = computed<Record<string, ChartData<'bar'>>>(() => {
  const history = workerHistory.value;

  // History is keyed by agentId; CuiChartTable looks charts up by item.name.
  return workers.value.reduce((acc: Record<string, ChartData<'bar'>>, worker) => {
    for (const valueKey of ['cpuLoad', 'memLoad'] as const) {
      const entries = history[worker.agentId] ?? [];
      const processData = entries
        .slice(-MAX_WORKERS_DATA_POINTS)
        .filter((info) => info[valueKey] !== undefined)
        .map((info) => parseFloat(info[valueKey] as string));
      const timestamps = entries.slice(-MAX_WORKERS_DATA_POINTS).map((info) => info.lastHeartbeat);
      const data = [...processData, ...Array(MAX_WORKERS_DATA_POINTS - processData.length).fill(0)];
      const labels = [...timestamps, ...Array(MAX_WORKERS_DATA_POINTS - timestamps.length).fill(null)];

      acc[`${worker.name}_${valueKey}`] = {
        labels,
        datasets: [
          {
            data,
            backgroundColor: (context) => {
              const value = context.raw as number;
              if (value >= 90) return '#FA5252';
              if (value >= 50) return '#FF9966';
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
    }

    return acc;
  }, {});
});

async function handleRestartWorker(workerName: string, agentId: string) {
  workersRestarting.value.push(workerName);
  try {
    await restartWorkerMutation(agentId);
  } finally {
    workersRestarting.value = workersRestarting.value.filter((n) => n !== workerName);
  }
}

function getWorkerOptions() {
  const options: { label: string; value: string }[] = [];
  for (const worker of workers.value) {
    const label = worker.online ? worker.name : `${worker.name} (${t('views.workers.offline').toLowerCase()})`;
    options.push({ label, value: worker.agentId });
  }
  return options;
}

function getValidAgentId(agentId?: string) {
  if (!agentId) return null;
  return workerIds.value.has(agentId) ? agentId : null;
}

function matchesNpmList(list: string[] | undefined, value: string): boolean {
  if (!list?.length) return true;
  const negations = list.filter((entry) => entry.startsWith('!')).map((entry) => entry.slice(1));
  const positives = list.filter((entry) => !entry.startsWith('!'));
  if (negations.includes(value)) return false;
  return positives.length === 0 || positives.includes(value);
}

function isPluginCompatibleWithWorker(plugin: CameraUiPlugin, worker: WorkerInfo): boolean {
  if (!worker.platform) return true;
  return matchesNpmList(plugin.os, worker.platform.os) && matchesNpmList(plugin.cpu, worker.platform.arch);
}

function platformRequirement(plugin: CameraUiPlugin): string {
  const parts: string[] = [];
  if (plugin.os?.length) parts.push(`os: ${plugin.os.join(', ')}`);
  if (plugin.cpu?.length) parts.push(`cpu: ${plugin.cpu.join(', ')}`);
  return parts.join(' · ');
}

function getPluginWorkerOptions(plugin: CameraUiPlugin) {
  const options: { label: string; value: string; disabled: boolean }[] = [];
  for (const worker of workers.value) {
    const compatible = isPluginCompatibleWithWorker(plugin, worker);
    const offline = worker.online ? '' : ` (${t('views.workers.offline').toLowerCase()})`;
    const incompatible = compatible ? '' : ` — ${t('views.workers.incompatible')}`;
    options.push({
      label: `${worker.name}${offline}${incompatible}`,
      value: worker.agentId,
      disabled: !compatible,
    });
  }
  return options;
}

function isAssigningPlugin(pluginName: string): boolean {
  return assigningPluginNames.value.has(pluginName);
}

async function handlePluginAssignment(plugin: CameraUiPlugin, agentId: string | null) {
  if (agentId === getValidAgentId(plugin.workerAgentId)) return;

  const pending = new Set(assigningPluginNames.value);
  pending.add(plugin.pluginName);
  assigningPluginNames.value = pending;

  try {
    if (agentId) {
      await assignPlugin({ pluginName: plugin.pluginName, agentId });
    } else {
      await unassignPlugin({ pluginName: plugin.pluginName });
    }
  } catch {
    // handled in the mutation's onError
  } finally {
    const done = new Set(assigningPluginNames.value);
    done.delete(plugin.pluginName);
    assigningPluginNames.value = done;
  }
}

function isAssigning(cameraId: string): boolean {
  return assigningCameraIds.value.has(cameraId);
}

async function handleAssignment(camera: DBCamera, agentId: string | null) {
  if (agentId === getValidAgentId(camera.workerAgentId)) return;

  const pending = new Set(assigningCameraIds.value);
  pending.add(camera._id);
  assigningCameraIds.value = pending;

  try {
    // Optimistic cache patch + rollback + error toast live in the mutation.
    if (agentId) {
      await assignCamera({ cameraId: camera._id, agentId });
    } else {
      await unassignCamera({ cameraId: camera._id });
    }
  } catch {
    // handled in the mutation's onError
  } finally {
    const done = new Set(assigningCameraIds.value);
    done.delete(camera._id);
    assigningCameraIds.value = done;
  }
}

async function handleCreatePairing() {
  try {
    pairing.value = await createPairing();
  } catch {
    // surfaced via the spinner clearing
  }
}

async function handleToggle(enabled: boolean) {
  if (enabled && !addressDraft.value) {
    // Prefill a sensible default before enabling.
    addressDraft.value = workersConfig.value?.suggestedAddresses?.[0] ?? '';
    if (!addressDraft.value) {
      dialog.openTextDialog({
        data: {
          title: t('views.workers.enable_workers'),
          contentText: t('views.workers.address_required'),
          confirmText: t('views.workers.ok'),
        },
      });
      return;
    }
  }

  try {
    await patchConfig(enabled ? { enabled: true, address: addressDraft.value, port: portDraft.value } : { enabled: false });
  } catch {
    // handled in the mutation's onError
  }
}

async function handleSaveConfig() {
  try {
    await patchConfig({ address: addressDraft.value, port: portDraft.value });
  } catch {
    // handled in the mutation's onError
  }
}

function handleRemoveWorker(worker: WorkerInfo) {
  dialog.openTextDialog({
    data: {
      title: t('views.workers.remove_worker'),
      confirmText: t('views.workers.remove'),
      contentText: t('views.workers.remove_worker_confirm', { name: worker.name }),
      confirmButtonProps: { severity: 'danger' },
    },
    // width:auto would stretch the dialog to the text length (up to 1000px)
    dialogSize: {
      desktop: {
        width: 'auto',
        maxWidth: '560px',
        maxHeight: '90vh',
      },
    },
    onConfirm: async () => {
      workersRemoving.value.push(worker.agentId);
      try {
        // Cameras assigned to it fall back to local; credentials are revoked.
        await removeWorkerMutation(worker.agentId);
      } finally {
        workersRemoving.value = workersRemoving.value.filter((id) => id !== worker.agentId);
      }
    },
  });
}

onBeforeMount(async () => {
  workersSocket.connect();

  await nextTick();

  workersSocket.loadAll();

  workersLoaded.value = true;
});

watch(
  workersConfig,
  (config) => {
    if (!config) return;
    addressDraft.value = config.address;
    portDraft.value = config.port;
  },
  { immediate: true },
);

onUnmounted(() => {
  workersSocket.disconnect();
});
</script>

<style scoped>
.pairing-snippet {
  background: var(--p-content-hover-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.75rem;
  font-size: 0.8rem;
  overflow-x: auto;
  white-space: pre;
}
</style>
