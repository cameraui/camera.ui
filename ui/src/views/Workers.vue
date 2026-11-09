<template>
  <div>
    <h1 v-if="!smBreakpoint" class="page-title">{{ $t('views.workers.title') }}</h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="goBack('/menu')">
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
              <CuiToggleRow :label="$t('views.workers.enable_workers')" :hint="$t('views.workers.enable_workers_description')">
                <ToggleSwitch :model-value="workersEnabled" :disabled="configSaving" @update:model-value="handleToggle" />
              </CuiToggleRow>

              <template v-if="workersEnabled">
                <div class="flex flex-col field-gap">
                  <label for="master-address" class="cui-label">{{ $t('views.workers.master_address') }}</label>
                  <Select
                    v-model="addressDraft"
                    input-id="master-address"
                    :options="addressOptions"
                    editable
                    option-label="label"
                    option-value="value"
                    :placeholder="$t('views.workers.master_address_placeholder')"
                    class="w-full"
                  />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.workers.master_address_hint') }}
                  </Message>
                </div>

                <div class="flex flex-col field-gap">
                  <label for="leaf-port" class="cui-label">{{ $t('views.workers.leaf_port') }}</label>
                  <InputNumber v-model="portDraft" input-id="leaf-port" :min="1024" :max="65535" :use-grouping="false" class="w-full" />
                  <Message v-if="portChanged && (workersConfig?.pairedWorkers ?? 0) > 0" severity="warn" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.workers.port_change_warning') }}
                  </Message>
                </div>

                <div class="flex flex-row items-end justify-end">
                  <Button class="cui-button-medium" :label="$t('views.workers.save')" :loading="configSaving" :disabled="!configDirty" @click="handleSaveConfig" />
                </div>
              </template>
            </div>
          </template>
        </Card>
      </div>

      <Message v-if="workersEnabled && workersConfig?.acceptorError" severity="error" size="small" :closable="false">
        {{ $t('views.workers.acceptor_error', { error: workersConfig.acceptorError }) }}
      </Message>

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
            <span class="text-sm block mb-6">{{ $t('views.workers.camera_assignments_description') }}</span>
            <CuiDataTable :value="cameras" :loading="camerasLoading" :pt="assignmentTablePt" striped-rows class="w-full">
              <template #loading>
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </template>
              <template #empty>
                <span class="text-muted text-sm">{{ $t('views.workers.no_cameras') }}</span>
              </template>

              <Column header="" header-class="p-2 w-5 max-w-5" class="p-2 w-5 max-w-5">
                <template #body="{ data }">
                  <div class="flex items-center justify-center">
                    <Badge
                      v-tooltip="{ value: placementTooltip(placementSocket.cameras.value[data.name]) }"
                      :style="{ background: placementColor(placementSocket.cameras.value[data.name]) }"
                    />
                  </div>
                </template>
              </Column>

              <Column field="name" :header="$t('views.workers.camera')" header-class="p-2 w-full min-w-40" class="p-2 w-full min-w-40">
                <template #body="{ data }">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-color text-sm">{{ data.name }}</span>
                    <i-mdi:alert-circle v-if="frameLinkHints.has(data._id)" v-tooltip="frameLinkHints.get(data._id)" class="w-4 h-4 shrink-0 text-orange-500" />
                  </div>
                </template>
              </Column>

              <Column :header="$t('views.workers.workers')" header-class="p-2" class="p-2">
                <template #body="{ data }">
                  <Select
                    :model-value="cameraDraft(data).agentId"
                    :options="getWorkerOptions(data.workerAgentId)"
                    option-label="label"
                    option-value="value"
                    :placeholder="$t('views.workers.local')"
                    class="w-64"
                    show-clear
                    :loading="isAssigning(data._id)"
                    :disabled="savingCameras"
                    @update:model-value="(val: string | null) => setCameraWorker(data, val)"
                  />
                </template>
              </Column>

              <Column :header="$t('views.workers.fallback')" header-class="p-2" class="p-2">
                <template #body="{ data }">
                  <span v-tooltip.top="cameraDraft(data).agentId ? $t('views.workers.fallback_hint') : $t('views.workers.fallback_no_worker')" class="inline-flex">
                    <ToggleSwitch
                      :model-value="!cameraDraft(data).workerOnly"
                      :disabled="!cameraDraft(data).agentId || savingCameras"
                      @update:model-value="(fallback: boolean) => setCameraFallback(data, fallback)"
                    />
                  </span>
                </template>
              </Column>
            </CuiDataTable>
            <div class="flex flex-row justify-end mt-6">
              <Button class="cui-button-medium" :label="$t('views.workers.save')" :loading="savingCameras" :disabled="!camerasDirty" @click="handleSaveCameras" />
            </div>
          </template>
        </Card>
      </div>

      <div v-if="workersEnabled && workers.length">
        <span class="card-title">{{ $t('views.workers.plugin_assignments') }}</span>
        <Card class="cui-card">
          <template #content>
            <span class="text-sm block mb-6">{{ $t('views.workers.plugin_assignments_description') }}</span>
            <CuiDataTable :value="plugins" :loading="pluginsLoading" :pt="assignmentTablePt" striped-rows class="w-full">
              <template #loading>
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </template>
              <template #empty>
                <span class="text-muted text-sm">{{ $t('views.workers.no_plugins') }}</span>
              </template>

              <Column header="" header-class="p-2 w-5 max-w-5" class="p-2 w-5 max-w-5">
                <template #body="{ data }">
                  <div class="flex items-center justify-center">
                    <Badge
                      v-tooltip="{ value: placementTooltip(placementSocket.plugins.value[data.pluginName], pluginInstallVersion(data.pluginName)) }"
                      :style="{ background: placementColor(placementSocket.plugins.value[data.pluginName]) }"
                    />
                  </div>
                </template>
              </Column>

              <Column field="displayName" :header="$t('views.workers.plugin')" header-class="p-2 w-full min-w-40" class="p-2 w-full min-w-40">
                <template #body="{ data }">
                  <div class="flex flex-col">
                    <span class="font-bold text-color text-sm">{{ data.displayName }}</span>
                    <span v-if="platformRequirement(data)" class="text-muted text-xs">{{ platformRequirement(data) }}</span>
                  </div>
                </template>
              </Column>

              <Column :header="$t('views.workers.workers')" header-class="p-2" class="p-2">
                <template #body="{ data }">
                  <Select
                    :model-value="pluginDraft(data).agentId"
                    :options="getPluginWorkerOptions(data)"
                    option-label="label"
                    option-value="value"
                    option-disabled="disabled"
                    :placeholder="$t('views.workers.local')"
                    class="w-64"
                    show-clear
                    :loading="isAssigningPlugin(data.pluginName)"
                    :disabled="savingPlugins"
                    @update:model-value="(val: string | null) => setPluginWorker(data, val)"
                  />
                </template>
              </Column>

              <Column :header="$t('views.workers.fallback')" header-class="p-2" class="p-2">
                <template #body="{ data }">
                  <span v-tooltip.top="pluginFallbackTooltip(data)" class="inline-flex">
                    <ToggleSwitch
                      :model-value="data.compatible && !pluginDraft(data).workerOnly"
                      :disabled="!pluginDraft(data).agentId || !data.compatible || savingPlugins"
                      @update:model-value="(fallback: boolean) => setPluginFallback(data, fallback)"
                    />
                  </span>
                </template>
              </Column>
            </CuiDataTable>
            <div class="flex flex-row justify-end mt-6">
              <Button class="cui-button-medium" :label="$t('views.workers.save')" :loading="savingPlugins" :disabled="!pluginsDirty" @click="handleSavePlugins" />
            </div>
          </template>
        </Card>
      </div>

      <div v-if="workersEnabled">
        <span class="card-title">{{ $t('views.workers.pair_worker') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.workers.pair_worker_description') }}</span>

              <div v-if="workers.length" class="flex flex-col field-gap">
                <label for="pairing-replaces" class="cui-label">{{ $t('views.workers.replaces') }}</label>
                <Select
                  v-model="replacesDraft"
                  input-id="pairing-replaces"
                  :options="replaceOptions"
                  option-label="label"
                  option-value="value"
                  :placeholder="$t('views.workers.replaces_none')"
                  class="w-full"
                  show-clear
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                  {{ $t('views.workers.replaces_hint') }}
                </Message>
              </div>

              <template v-if="pairing">
                <div class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.workers.pairing_code') }}</label>
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
                  <Message v-if="pairingMinutesLeft > 0" severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.workers.pairing_expires', { minutes: pairingMinutesLeft }) }}
                  </Message>
                  <Message v-else severity="warn" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.workers.pairing_expired') }}
                  </Message>
                </div>

                <div v-if="pairing.caFingerprint" class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.workers.ca_fingerprint') }}</label>
                  <span class="text-xs font-mono break-all">{{ pairing.caFingerprint }}</span>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.workers.ca_fingerprint_hint') }}
                  </Message>
                </div>

                <div class="flex flex-col field-gap">
                  <div class="flex flex-row items-center justify-between">
                    <label class="cui-label">{{ $t('views.workers.pairing_snippet') }}</label>
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
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.workers.pairing_snippet_hint') }}
                  </Message>
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
import UpdateAvailableIcon from '~icons/icon-park-solid/up-c';
import UpdateIcon from '~icons/material-symbols/deployed-code-update';
import RemoveIcon from '~icons/mdi/delete-outline';
import EditIcon from '~icons/mdi/pencil-outline';

import { ApiQuery } from '@/api/routes/api.js';
import { CamerasQuery } from '@/api/routes/cameras.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { WorkersQuery } from '@/api/routes/workers.js';
import { copyToClipboard as copy, formatCardTime, formatTimestamp } from '@/common/utils.js';
import EditWorkerDialog from '@/components/CuiDialog/templates/EditWorker/EditWorker.vue';

import type { TableHeader } from '@/components/CuiChartTable/types.js';
import type { EditWorkerProps, EditWorkerResult } from '@/components/CuiDialog/templates/EditWorker/types.js';
import type { PassThrough } from '@openvue/core';
import type { CameraUiPlugin, DBCamera, PlacementInfo, WorkerInfo, WorkerPairingResponse } from '@shared/types';
import type { ChartData } from 'chart.js';
import type { DataTablePassThroughOptions } from 'openvue';

interface Assignment {
  agentId: string | null;
  workerOnly: boolean;
}

const { goBack } = useBackNavigation();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const dialog = useCuiDialog();
const updatesStore = useUpdatesStore();
const toast = useCuiToast();
const workersSocket = useWorkersSocket();
const { workers, workerHistory, isConnected } = workersSocket;
const placementSocket = usePlacementSocket();
const { placementLabel, placementDetail } = usePlacementLabel();
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 30_000) });

const apiQuery = new ApiQuery();
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
const { mutateAsync: updateWorkerMutation } = workersQuery.updateWorkerQuery();
const { mutateAsync: createPairing, isPending: generatingCode } = workersQuery.createPairingQuery();
const { mutateAsync: removeWorkerMutation } = workersQuery.removeWorkerQuery();
const { mutateAsync: assignPlugin } = workersQuery.assignPluginQuery();
const { mutateAsync: unassignPlugin } = workersQuery.unassignPluginQuery();
const { mutateAsync: patchWorkerMutation } = workersQuery.patchWorkerQuery();
const { data: frameLinks } = workersQuery.getFrameLinksQuery(() => Boolean(workersConfig.value?.enabled) && workers.value.length > 0);
const { data: apiInfo } = apiQuery.apiInfoQuery();

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
const workersUpdating = ref<string[]>([]);
const assigningCameraIds = ref(new Set<string>());
const assigningPluginNames = ref(new Set<string>());
const cameraDrafts = ref(new Map<string, Assignment>());
const pluginDrafts = ref(new Map<string, Assignment>());
const savingCameras = ref(false);
const savingPlugins = ref(false);
const pairing = ref<WorkerPairingResponse | null>(null);
const replacesDraft = ref<string | null>(null);
const addressDraft = ref('');
const portDraft = ref(7422);

let updateErrorsSeeded = false;
const seenUpdateErrors = new Map<string, string>();

const cameras = computed(() => camerasData.value?.result ?? []);
const plugins = computed(() => pluginsData.value?.result ?? []);
const workersEnabled = computed(() => workersConfig.value?.enabled ?? false);
const addressOptions = computed(() => (workersConfig.value?.suggestedAddresses ?? []).map((address) => ({ label: address, value: address })));
const portChanged = computed(() => portDraft.value !== (workersConfig.value?.port ?? 7422));
const configDirty = computed(() => addressDraft.value !== (workersConfig.value?.address ?? '') || portChanged.value);
const workerIds = computed(() => new Set(workers.value.map((w) => w.agentId)));
const masterVersion = computed(() => updatesStore.targetServerVersion ?? apiInfo.value?.version);

const camerasDirty = computed(() => cameras.value.some((camera) => !sameAssignment(cameraDraft(camera), savedAssignment(camera))));
const pluginsDirty = computed(() => plugins.value.some((plugin) => !sameAssignment(pluginDraft(plugin), savedAssignment(plugin))));

const frameLinkHints = computed(() => {
  const hints = new Map<string, string>();
  for (const link of frameLinks.value ?? []) {
    const hint = t('views.workers.frame_link_hint', {
      plugin: plugins.value.find((plugin) => plugin.pluginName === link.pluginName)?.displayName ?? link.pluginName,
      pluginHost: hostName(link.pluginWorker),
      types: link.sensorTypes.map((type) => t(`components.camera_options.sensor_type_${type}`)).join(', '),
    });
    const before = hints.get(link.cameraId);
    hints.set(link.cameraId, before ? `${before} ${hint}` : hint);
  }
  return hints;
});

const pairingMinutesLeft = computed(() => {
  if (!pairing.value) return 0;
  return Math.max(0, Math.ceil((pairing.value.expiresAt - now.value.getTime()) / 60_000));
});

const replaceOptions = computed(() => workers.value.map((worker) => ({ label: worker.name, value: worker.agentId })));

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
    color: (item: WorkerInfo) => stateColor(item),
    tooltip(item: WorkerInfo) {
      if (item.state === 'online' && !item.update?.updating && isBehind(item)) return t('views.workers.version_mismatch', { version: item.version || '?' });
      return stateLabel(item);
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
    field: (item: WorkerInfo) => stateLabel(item),
    name: t('views.workers.status'),
    tooltip: (item: WorkerInfo) => stateDetail(item),
    columnProps: {
      headerClass: 'min-w-48',
      class: 'min-w-48',
    },
  },
  {
    type: 'category',
    field: (item: WorkerInfo) => workloadSummary(item),
    name: t('views.workers.workloads'),
    tooltip: (item: WorkerInfo) => workloadDetail(item),
    asChip: true,
    columnProps: {
      headerClass: 'min-w-30',
      class: 'min-w-30',
    },
  },
  {
    type: 'category',
    field: (item: WorkerInfo) => (item.version ? `v${item.version}` : '—'),
    name: t('views.workers.version'),
    hint: (item: WorkerInfo) => {
      if (!item.version || !isBehind(item) || !masterVersion.value) return undefined;
      return { icon: UpdateAvailableIcon, tooltip: t('views.workers.version_update', { version: masterVersion.value }), class: 'text-green-500' };
    },
    asChip: true,
    columnProps: {
      headerClass: 'min-w-30',
      class: 'min-w-30',
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
        icon: EditIcon,
        buttonProps: { severity: 'secondary' },
        tooltip: () => t('views.workers.edit_worker'),
        action: (item: WorkerInfo) => handleEditWorker(item),
      },
      {
        icon: UpdateIcon,
        buttonProps: { severity: 'secondary' },
        loading: (item: WorkerInfo) => item.update?.updating || workersUpdating.value.includes(item.agentId),
        disabled: (item: WorkerInfo) => !reachable(item) || !isBehind(item) || !item.update?.updatable,
        tooltip: (item: WorkerInfo) => updateTooltip(item),
        action: (item: WorkerInfo) => handleUpdateWorker(item.agentId),
      },
      {
        icon: RestartIcon,
        buttonProps: { severity: 'secondary' },
        loading: (item: WorkerInfo) => workersRestarting.value.includes(item.name),
        disabled: (item: WorkerInfo) => !reachable(item) || item.update?.updating === true,
        tooltip: () => t('views.workers.restart_worker'),
        action: (item: WorkerInfo) => handleRestartWorker(item.name, item.agentId),
      },
      {
        icon: RemoveIcon,
        buttonProps: { severity: 'danger' },
        loading: (item: WorkerInfo) => workersRemoving.value.includes(item.agentId),
        tooltip: () => t('views.workers.remove_worker'),
        action: (item: WorkerInfo) => handleRemoveWorker(item),
      },
    ],
  },
]);

const workerChartData = computed<Record<string, ChartData<'bar'>>>(() => {
  const history = workerHistory.value;

  // history is keyed by agentId, CuiChartTable looks charts up by item.name
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

function handleEditWorker(worker: WorkerInfo) {
  const currentAddresses = worker.serverAddresses ?? [];

  dialog.openComponentDialog<EditWorkerProps>(EditWorkerDialog, {
    data: {
      title: t('views.workers.edit_worker'),
      confirmText: t('views.workers.save'),
      contentProps: {
        currentName: worker.name,
        addresses: worker.addresses ?? [],
        serverAddresses: currentAddresses,
      },
    },
    onConfirm: async (result: EditWorkerResult | null) => {
      if (!result) return;

      const nameChanged = result.name !== worker.name;
      const addressesChanged = result.serverAddresses.length !== currentAddresses.length || result.serverAddresses.some((address) => !currentAddresses.includes(address));
      if (!nameChanged && !addressesChanged) return;

      await patchWorkerMutation({
        agentId: worker.agentId,
        name: nameChanged ? result.name : undefined,
        serverAddresses: addressesChanged ? result.serverAddresses : undefined,
      });
    },
  });
}

function isBehind(item: WorkerInfo): boolean {
  return item.versionStanding === 'behind' || (item.versionStanding === 'unknown' && item.versionMismatch === true);
}

function reachable(item: WorkerInfo): boolean {
  return item.state === 'online' || item.state === 'outdated';
}

function stateColor(worker: WorkerInfo): string {
  switch (worker.state) {
    case 'online':
      return isBehind(worker) ? 'orange' : 'green';
    case 'unreachable':
    case 'restarting':
      return 'yellow';
    case 'offline':
    case 'outdated':
    case 'conflict':
      return 'red';
    default:
      return 'gray';
  }
}

function stateShort(worker: WorkerInfo): string {
  switch (worker.state) {
    case 'online':
      return t('views.workers.online');
    case 'expected':
      return t('views.workers.state_expected');
    case 'unreachable':
      return t('views.workers.state_unreachable_short');
    case 'restarting':
      return t('views.workers.state_restarting');
    case 'outdated':
      return t('views.workers.state_outdated_short');
    case 'releasing':
      return t('views.workers.state_releasing');
    case 'released':
      return t('views.workers.state_released');
    case 'conflict':
      return t('views.workers.state_conflict_short');
    default:
      return t('views.workers.offline');
  }
}

function stateLabel(worker: WorkerInfo): string {
  const since = worker.stateSince ? formatCardTime(worker.stateSince) : undefined;
  switch (worker.state) {
    case 'online':
      return updateLabel(worker) ?? t('views.workers.online');
    case 'unreachable':
      if (worker.stateReason?.startsWith('answers do not arrive')) return t('views.workers.state_no_answers');
      return since ? t('views.workers.state_unreachable', { time: since }) : stateShort(worker);
    case 'offline':
      return since ? t('views.workers.state_offline', { time: since }) : stateShort(worker);
    case 'outdated':
      return t('views.workers.state_outdated', { version: worker.version ?? '?' });
    case 'conflict':
      return t('views.workers.state_conflict', { name: worker.name });
    default:
      return stateShort(worker);
  }
}

function stateDetail(worker: WorkerInfo): string | undefined {
  const parts: string[] = [];
  if (worker.stateReason && worker.state !== 'online') parts.push(worker.stateReason.charAt(0).toUpperCase() + worker.stateReason.slice(1));
  if (worker.stateUntil && worker.stateUntil > now.value.getTime()) {
    parts.push(t('views.workers.state_moves_at', { time: formatTimestamp(worker.stateUntil).formattedTime }));
  }
  const last = worker.update?.lastResult;
  if (last && last.result !== 'applied') {
    const key = last.result === 'rolled-back' ? 'views.workers.update_rolled_back' : 'views.workers.update_swap_failed';
    parts.push(t(key, { version: last.target, reason: last.reason ?? '?' }));
  }
  if (worker.update?.error) parts.push(t('views.workers.update_failed', { error: worker.update.error }));
  return parts.length ? parts.join('. ') : undefined;
}

function updateLabel(worker: WorkerInfo): string | undefined {
  if (!worker.update?.updating) return undefined;
  switch (worker.update.phase) {
    case 'installing':
      return t('views.workers.update_installing');
    case 'staged':
      return t('views.workers.update_staged');
    case 'restarting':
      return t('views.workers.update_restarting');
    default:
      return t('views.workers.updating');
  }
}

function workloadName(key: string): string {
  const id = key.slice(key.indexOf(':') + 1);
  if (key.startsWith('frameDecoding:')) return cameras.value.find((camera) => camera._id === id)?.name ?? id;
  return plugins.value.find((plugin) => plugin.pluginName === id)?.displayName ?? id;
}

function workloadSummary(worker: WorkerInfo): string {
  const workloads = worker.workloads ?? [];
  const running = workloads.filter((workload) => workload.phase === 'running').length;
  return running === workloads.length ? `${running}` : `${running}/${workloads.length}`;
}

function workloadDetail(worker: WorkerInfo): string | undefined {
  const lines = (worker.workloads ?? []).map((workload) => {
    const failure = workload.failure ? ` (${workload.failure.message})` : '';
    return `${workloadName(workload.key)}: ${t(`views.workers.workload_${workload.phase}`)}${failure}`;
  });
  return lines.length ? lines.join(', ') : undefined;
}

function offers(worker: WorkerInfo, capability: 'frameDecoding' | 'pluginHost'): boolean {
  return worker.capabilities.length === 0 || (worker.capabilities as string[]).includes(capability);
}

function optionLabel(worker: WorkerInfo, ...notes: string[]): string {
  const all = [worker.state === 'online' ? undefined : stateShort(worker), ...notes].filter((note): note is string => Boolean(note));
  return all.length ? `${worker.name} (${all.join(', ')})` : worker.name;
}

function placementTooltip(placement: PlacementInfo | undefined, version?: string): string {
  const until = placement?.phase === 'held' ? workers.value.find((worker) => worker.agentId === placement.host)?.stateUntil : undefined;
  const label = placementLabel(placement, { until, version }) ?? t('views.workers.not_running');
  const detail = placementDetail(placement);
  return detail ? `${label}: ${detail}` : label;
}

function placementColor(placement: PlacementInfo | undefined): string {
  switch (placement?.phase) {
    case 'local':
    case 'bound':
      return 'green';
    case 'held':
      return 'yellow';
    case 'failed':
      return 'red';
    case 'waiting-for-worker':
    case undefined:
      return 'gray';
    default:
      return 'orange';
  }
}

function pluginFallbackTooltip(plugin: CameraUiPlugin): string {
  if (!pluginDraft(plugin).agentId) return t('views.workers.fallback_no_worker');
  return plugin.compatible ? t('views.workers.fallback_hint') : t('views.workers.fallback_unavailable');
}

function pluginInstallVersion(pluginName: string): string | undefined {
  const key = `pluginHost:${pluginName}`;
  for (const worker of workers.value) {
    const version = worker.workloads?.find((workload) => workload.key === key)?.install?.version;
    if (version) return version;
  }
  return undefined;
}

function movingText(name: string, agentId: string | null): string {
  return agentId ? t('views.workers.moving', { name, host: hostName(agentId) }) : t('views.workers.moving_local', { name });
}

function updateTooltip(item: WorkerInfo): string {
  if (item.update?.updating) return updateLabel(item) ?? t('views.workers.updating');
  if (!masterVersion.value) return t('views.workers.update_worker_short');
  return t('views.workers.update_worker', { version: masterVersion.value });
}

async function handleUpdateWorker(agentId: string) {
  seenUpdateErrors.delete(agentId);
  workersUpdating.value.push(agentId);
  try {
    await updateWorkerMutation({ agentId });
  } finally {
    workersUpdating.value = workersUpdating.value.filter((id) => id !== agentId);
  }
}

async function handleRestartWorker(workerName: string, agentId: string) {
  workersRestarting.value.push(workerName);
  try {
    await restartWorkerMutation(agentId);
  } catch {
    // handled in the mutation's onError
  } finally {
    workersRestarting.value = workersRestarting.value.filter((n) => n !== workerName);
  }
}

function getWorkerOptions(assigned?: string) {
  return workers.value
    .filter((worker) => offers(worker, 'frameDecoding') || worker.agentId === assigned)
    .map((worker) => ({ label: optionLabel(worker), value: worker.agentId }));
}

function getValidAgentId(agentId?: string) {
  if (!agentId) return null;
  return workerIds.value.has(agentId) ? agentId : null;
}

function hostName(agentId?: string): string {
  if (!agentId) return t('views.workers.local');
  const worker = workers.value.find((entry) => entry.agentId === agentId);
  if (!worker) return agentId;
  return worker.state === 'online' ? worker.name : `${worker.name}, ${stateShort(worker)}`;
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
  return workers.value
    .filter((worker) => offers(worker, 'pluginHost') || worker.agentId === plugin.workerAgentId)
    .map((worker) => {
      const compatible = isPluginCompatibleWithWorker(plugin, worker);
      return {
        label: optionLabel(worker, compatible ? '' : t('views.workers.incompatible')),
        value: worker.agentId,
        disabled: !compatible,
      };
    });
}

function isAssigningPlugin(pluginName: string): boolean {
  return assigningPluginNames.value.has(pluginName);
}

function savedAssignment(record: DBCamera | CameraUiPlugin): Assignment {
  const agentId = getValidAgentId(record.workerAgentId);
  return { agentId, workerOnly: Boolean(agentId && record.workerOnly) };
}

function sameAssignment(a: Assignment, b: Assignment): boolean {
  return a.agentId === b.agentId && a.workerOnly === b.workerOnly;
}

function setDraft(drafts: Map<string, Assignment>, key: string, next: Assignment, saved: Assignment) {
  if (sameAssignment(next, saved)) drafts.delete(key);
  else drafts.set(key, next);
}

function cameraDraft(camera: DBCamera): Assignment {
  return cameraDrafts.value.get(camera._id) ?? savedAssignment(camera);
}

function setCameraWorker(camera: DBCamera, agentId: string | null) {
  setDraft(cameraDrafts.value, camera._id, { agentId, workerOnly: Boolean(agentId) && cameraDraft(camera).workerOnly }, savedAssignment(camera));
}

function setCameraFallback(camera: DBCamera, fallback: boolean) {
  setDraft(cameraDrafts.value, camera._id, { ...cameraDraft(camera), workerOnly: !fallback }, savedAssignment(camera));
}

function pluginDraft(plugin: CameraUiPlugin): Assignment {
  return pluginDrafts.value.get(plugin.pluginName) ?? savedAssignment(plugin);
}

function setPluginWorker(plugin: CameraUiPlugin, agentId: string | null) {
  setDraft(pluginDrafts.value, plugin.pluginName, { agentId, workerOnly: Boolean(agentId) && pluginDraft(plugin).workerOnly }, savedAssignment(plugin));
}

function setPluginFallback(plugin: CameraUiPlugin, fallback: boolean) {
  setDraft(pluginDrafts.value, plugin.pluginName, { ...pluginDraft(plugin), workerOnly: !fallback }, savedAssignment(plugin));
}

function handleSavePlugins() {
  const moves = plugins.value
    .filter((plugin) => pluginDraft(plugin).agentId !== savedAssignment(plugin).agentId)
    .map((plugin) => ({
      plugin: plugin.displayName,
      from: hostName(savedAssignment(plugin).agentId ?? undefined),
      to: hostName(pluginDraft(plugin).agentId ?? undefined),
    }));
  if (!moves.length) {
    savePlugins();
    return;
  }

  dialog.openTextDialog({
    data: {
      title: moves.length > 1 ? t('views.workers.move_plugins') : t('views.workers.move_plugin'),
      confirmText: t('views.workers.move'),
      contentText:
        moves.length > 1
          ? t('views.workers.move_plugins_confirm', { plugins: moves.map((move) => t('views.workers.move_plugin_item', move)).join(', ') })
          : t('views.workers.move_plugin_confirm', moves[0]!),
    },
    dialogSize: {
      desktop: {
        width: 'auto',
        maxWidth: '560px',
        maxHeight: '90vh',
      },
    },
    onConfirm: () => savePlugins(),
  });
}

async function savePlugins() {
  savingPlugins.value = true;
  try {
    for (const plugin of plugins.value) {
      const draft = pluginDrafts.value.get(plugin.pluginName);
      if (!draft) continue;
      const saved = savedAssignment(plugin);
      if (!sameAssignment(draft, saved)) {
        const moving = await assignPluginTo(plugin, draft);
        if (moving === undefined) continue;
        if (moving && draft.agentId !== saved.agentId) toast.add({ severity: 'info', detail: movingText(plugin.displayName, draft.agentId), life: 4000 });
      }
      pluginDrafts.value.delete(plugin.pluginName);
    }
  } finally {
    savingPlugins.value = false;
  }
}

async function assignPluginTo(plugin: CameraUiPlugin, { agentId, workerOnly }: Assignment): Promise<boolean | undefined> {
  const pending = new Set(assigningPluginNames.value);
  pending.add(plugin.pluginName);
  assigningPluginNames.value = pending;

  try {
    return agentId ? await assignPlugin({ pluginName: plugin.pluginName, agentId, workerOnly }) : await unassignPlugin({ pluginName: plugin.pluginName });
  } catch {
    // handled in the mutation's onError
    return undefined;
  } finally {
    const done = new Set(assigningPluginNames.value);
    done.delete(plugin.pluginName);
    assigningPluginNames.value = done;
  }
}

function isAssigning(cameraId: string): boolean {
  return assigningCameraIds.value.has(cameraId);
}

async function handleSaveCameras() {
  savingCameras.value = true;
  try {
    for (const camera of cameras.value) {
      const draft = cameraDrafts.value.get(camera._id);
      if (!draft) continue;
      const saved = savedAssignment(camera);
      if (!sameAssignment(draft, saved)) {
        const moving = await assignCameraTo(camera, draft);
        if (moving === undefined) continue;
        if (moving && draft.agentId !== saved.agentId) toast.add({ severity: 'info', detail: movingText(camera.name, draft.agentId), life: 4000 });
      }
      cameraDrafts.value.delete(camera._id);
    }
  } finally {
    savingCameras.value = false;
  }
}

async function assignCameraTo(camera: DBCamera, { agentId, workerOnly }: Assignment): Promise<boolean | undefined> {
  const pending = new Set(assigningCameraIds.value);
  pending.add(camera._id);
  assigningCameraIds.value = pending;

  try {
    // the mutation does the optimistic patch, rollback and toast
    return agentId ? await assignCamera({ cameraId: camera._id, agentId, workerOnly }) : await unassignCamera({ cameraId: camera._id });
  } catch {
    // handled in the mutation's onError
    return undefined;
  } finally {
    const done = new Set(assigningCameraIds.value);
    done.delete(camera._id);
    assigningCameraIds.value = done;
  }
}

async function handleCreatePairing() {
  try {
    pairing.value = await createPairing(replacesDraft.value ?? undefined);
  } catch {
    // handled in the mutation's onError
  }
}

async function handleToggle(enabled: boolean) {
  if (enabled && !addressDraft.value) {
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
    // width:auto would stretch the dialog to the text, up to 1000px
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
        await removeWorkerMutation(worker.agentId);
      } finally {
        workersRemoving.value = workersRemoving.value.filter((id) => id !== worker.agentId);
      }
    },
  });
}

onBeforeMount(async () => {
  workersSocket.connect();
  placementSocket.connect();
  updatesStore.connect();

  await nextTick();

  workersSocket.loadAll();

  workersLoaded.value = true;
});

watch(
  () => [workersConfig.value?.address, workersConfig.value?.port] as const,
  ([address, port]) => {
    if (address === undefined || port === undefined) return;
    addressDraft.value = address;
    portDraft.value = port;
  },
  { immediate: true },
);

watch(workers, (list) => {
  if (!updateErrorsSeeded) {
    if (!list.length) return;
    for (const worker of list) {
      if (worker.update?.error) seenUpdateErrors.set(worker.agentId, worker.update.error);
    }
    updateErrorsSeeded = true;
    return;
  }
  for (const worker of list) {
    if (worker.update?.updating) {
      seenUpdateErrors.delete(worker.agentId);
      continue;
    }
    const error = worker.update?.error;
    if (!error) {
      seenUpdateErrors.delete(worker.agentId);
      continue;
    }
    if (seenUpdateErrors.get(worker.agentId) === error) continue;
    seenUpdateErrors.set(worker.agentId, error);
    toast.add({
      severity: 'error',
      summary: worker.name,
      detail: t('views.workers.update_failed', { error }),
      life: 6000,
    });
  }
});

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
