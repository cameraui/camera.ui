<template>
  <div class="h-full w-full relative overflow-hidden flex flex-col">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="onBack">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <template v-if="draft">
      <CuiAutomationToolbar
        :flow="draft"
        :show-history="!isNew && isAdmin"
        @show-history="openRunHistory"
        @update:name="onUpdateName"
        @toggle-enabled="
          draft.enabled = !draft.enabled;
          markDirty();
        "
        @toggle-suppress-duplicates="
          draft.suppressDuplicates = !draft.suppressDuplicates;
          markDirty();
        "
        @toggle-single-execution="
          draft.singleExecution = !draft.singleExecution;
          markDirty();
        "
      />

      <div class="flex flex-1 min-h-0">
        <CuiAutomationNodePalette v-if="!smBreakpoint" class="w-[240px] shrink-0" />

        <CuiAutomationCanvas ref="canvasRef" :flow="draft" :mobile="smBreakpoint" class="flex-1 min-w-0" @node-select="onNodeSelect" @change="onCanvasChange" />

        <div v-if="!smBreakpoint" class="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out" :style="{ width: selectedNode ? '300px' : '0px' }">
          <CuiAutomationNodeConfig
            v-if="selectedNode"
            :node="selectedNode"
            class="w-[300px]"
            @close="store.selectedNodeId = null"
            @update:data="(data) => onUpdateNodeData(store.selectedNodeId!, data)"
            @delete="onDeleteNode"
          />
        </div>
      </div>

      <SpeedDial
        :model="speedDialItems"
        direction="up"
        :transition-delay="80"
        :tooltip-options="{ position: 'left', event: undefined }"
        :style="{
          position: 'fixed',
          zIndex: 15,
          bottom: `calc(${bottombarHeight}px + ${hasChanges ? '4.25rem' : '1.25rem'} + env(safe-area-inset-bottom, 0px))`,
          right: fabRight || 'calc(1.25rem + env(safe-area-inset-right, 0px))',
          transition: 'right 0.2s ease-in-out, bottom 0.2s ease-in-out',
        }"
        :pt="{ root: { style: 'pointer-events: none' } }"
      >
        <template #button="{ visible, toggleCallback }">
          <Button rounded severity="secondary" class="pointer-events-auto" @click="toggleCallback">
            <template #icon>
              <div class="relative w-6 h-6">
                <div
                  class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                  :class="{ 'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': visible }"
                  :style="{ backgroundColor: 'var(--text-color)' }"
                />
                <div
                  class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
                  :class="{ 'opacity-0 scale-0': visible }"
                  :style="{ backgroundColor: 'var(--text-color)' }"
                />
                <div
                  class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                  :class="{ 'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': visible }"
                  :style="{ backgroundColor: 'var(--text-color)' }"
                />
              </div>
            </template>
          </Button>
        </template>
        <template #item="{ item, toggleCallback }">
          <Button v-tooltip="{ value: item.label }" severity="secondary" v-bind="item.buttonProps" rounded class="pointer-events-auto" @click="toggleCallback">
            <template #icon>
              <component :is="item.icon" />
            </template>
          </Button>
        </template>
      </SpeedDial>

      <Button
        v-if="smBreakpoint"
        v-tooltip="{ value: t('views.automation.add_step') }"
        rounded
        class="pointer-events-auto text-white"
        :style="{
          position: 'fixed',
          zIndex: 15,
          bottom: `calc(${bottombarHeight}px + 1.25rem + env(safe-area-inset-bottom, 0px))`,
          right: 'calc(4.75rem + env(safe-area-inset-right, 0px))',
        }"
        @click="showMobilePalette = true"
      >
        <template #icon>
          <PlusIcon class="w-5 h-5" />
        </template>
      </Button>

      <Button
        v-if="hasChanges"
        v-tooltip="{ value: t('views.automation.save') }"
        rounded
        severity="success"
        class="pointer-events-auto text-white"
        :style="{
          position: 'fixed',
          zIndex: 15,
          bottom: `calc(${bottombarHeight}px + 1.25rem + env(safe-area-inset-bottom, 0px))`,
          right: fabRight || 'calc(1.25rem + env(safe-area-inset-right, 0px))',
          transition: 'right 0.2s ease-in-out',
        }"
        @click="onSave"
      >
        <template #icon>
          <SaveIcon class="w-5 h-5" />
        </template>
      </Button>

      <CuiBottomSheet v-model="showMobilePalette" :title="t('views.automation.add_step')" max-height="70vh">
        <CuiAutomationNodePalette mode="click" @node-click="onMobileAddNode" />
      </CuiBottomSheet>
    </template>

    <div v-else-if="isFlowLoading" class="flex flex-1 items-center justify-center">
      <ProgressSpinner class="!w-8 !h-8" stroke-width="5" />
    </div>

    <div v-else class="flex flex-1 items-center justify-center">
      <span class="text-muted">{{ t('views.automations.no_automations') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import PlayIcon from '~icons/basil/play-solid';
import CleanIcon from '~icons/carbon/clean';
import RedoIcon from '~icons/carbon/redo';
import SaveIcon from '~icons/carbon/save';
import ShareIcon from '~icons/carbon/share';
import TrashIcon from '~icons/carbon/trash-can';
import UndoIcon from '~icons/carbon/undo';
import PlusIcon from '~icons/typcn/plus';

import { AutomationsQuery } from '@/api/routes/automations.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { stripBlueprintSecrets } from '@/common/automationBlueprint.js';
import { randomLetter } from '@/common/utils.js';
import CuiAutomationCanvas from '@/components/CuiAutomation/CuiAutomationCanvas.vue';
import CuiAutomationNodeConfig from '@/components/CuiAutomation/CuiAutomationNodeConfig.vue';
import CuiAutomationNodePalette from '@/components/CuiAutomation/CuiAutomationNodePalette.vue';
import CuiAutomationToolbar from '@/components/CuiAutomation/CuiAutomationToolbar.vue';
import { validateDraft } from '@/components/CuiAutomation/config/flowValidation.js';
import CuiAutomationMobileNodeConfig from '@/components/CuiAutomation/mobile/CuiAutomationMobileNodeConfig.vue';
import { getNodeDefinition } from '@/components/CuiAutomation/nodeDefinitions.js';

import type { AutomationFlow, AutomationNode, AutomationNodeType, CuiAutomationMobileNodeConfigProps } from '@/components/CuiAutomation/types.js';

const CuiAutomationRunsDialog = asyncComponent(() => import('@/components/CuiAutomation/CuiAutomationRunsDialog.vue'));

const automationsQuery = new AutomationsQuery();

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { bottombarHeight } = useSharedCuiStates();
const dialog = useCuiDialog();
const toast = useCuiToast();

const store = useAutomationsStore();

const flowId = computed(() => route.params.id as string);
const isNew = computed(() => flowId.value === 'new');
const isAdmin = computed(() => hasPermission(undefined, 'admin'));

const { data: flowData, isBusy: isFlowLoading } = automationsQuery.getAutomationQuery(flowId);
const { mutateAsync: createFlow } = automationsQuery.createAutomationQuery();
const { mutateAsync: patchFlow } = automationsQuery.patchAutomationQuery();
const { mutateAsync: removeFlow } = automationsQuery.deleteAutomationQuery();
const { mutateAsync: triggerFlow } = automationsQuery.triggerAutomationQuery();

const canvasRef = useTemplateRef<InstanceType<typeof CuiAutomationCanvas>>('canvasRef');
const showMobilePalette = ref(false);
const hasChanges = ref(false);
const canUndo = ref(false);
const canRedo = ref(false);

let leaveConfirmed = false;
let validateTimer: ReturnType<typeof setTimeout> | undefined;

const draft = computed<AutomationFlow | null>({
  get: () => store.draft as AutomationFlow | null,
  set: (v) => {
    store.draft = v as unknown as typeof store.draft;
  },
});

const selectedNode = computed((): AutomationNode | undefined => {
  if (!draft.value || !store.selectedNodeId) return undefined;
  return draft.value.nodes.find((n) => n.id === store.selectedNodeId);
});

const fabRight = computed(() => {
  if (smBreakpoint.value || !selectedNode.value) return undefined;
  return 'calc(300px + 1.25rem + env(safe-area-inset-right, 0px))';
});

const speedDialItems = computed(() => {
  const hasManualTrigger = draft.value?.nodes.some((n) => n.type === 'trigger-manual') ?? false;

  const items: { label: string; icon: any; buttonProps?: any; command: () => void }[] = [
    ...(hasManualTrigger
      ? [
          {
            label: t('views.automation.run'),
            icon: PlayIcon,
            buttonProps: { disabled: isNew.value || hasChanges.value },
            command: () => onRun(),
          },
        ]
      : []),
    {
      label: t('views.automation.undo'),
      icon: UndoIcon,
      buttonProps: { disabled: !canUndo.value },
      command: () => {
        canvasRef.value?.undo();
        markDirty();
      },
    },
    {
      label: t('views.automation.redo'),
      icon: RedoIcon,
      buttonProps: { disabled: !canRedo.value },
      command: () => {
        canvasRef.value?.redo();
        markDirty();
      },
    },
    {
      label: t('views.automation.export_blueprint'),
      icon: ShareIcon,
      command: () => onExportBlueprint(),
    },
    {
      label: t('views.automation.clear'),
      icon: CleanIcon,
      command: () => confirmClearFlow(),
    },
    {
      label: t('views.automations.delete'),
      icon: TrashIcon,
      buttonProps: { severity: 'danger' },
      command: () => confirmDeleteFlow(),
    },
  ];

  return items;
});

function syncHistoryState() {
  canUndo.value = canvasRef.value?.canUndo ?? false;
  canRedo.value = canvasRef.value?.canRedo ?? false;
}

function loadNewDraft() {
  draft.value = {
    _id: randomLetter(12),
    name: t('views.automation.untitled'),
    enabled: false,
    nodes: [],
    edges: [],
    suppressDuplicates: false,
    singleExecution: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.selectedNodeId = null;
}

function scheduleValidation() {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(() => {
    syncDraftFromCanvas();
    store.validationIssues = validateDraft(draft.value);
  }, 300);
}

function markDirty() {
  hasChanges.value = true;
  syncHistoryState();
  scheduleValidation();
}

function openRunHistory() {
  dialog.openComponentDialog(CuiAutomationRunsDialog, {
    data: {
      title: t('views.automations.run_history'),
      contentProps: { flowId: flowId.value },
      hideConfirmButton: true,
    },
  });
}

function onCanvasChange() {
  syncDraftFromCanvas();
  markDirty();
}

function onUpdateName(name: string) {
  if (draft.value) {
    draft.value.name = name;
    markDirty();
  }
}

function onUpdateNodeData(nodeId: string, data: Record<string, unknown>) {
  if (!draft.value) return;
  const node = draft.value.nodes.find((n) => n.id === nodeId);
  if (node?.data) {
    const changed = Object.entries(data).some(([key, value]) => (node.data as unknown as Record<string, unknown>)[key] !== value);
    if (!changed) return;

    Object.assign(node.data, data);
    canvasRef.value?.updateNodeData(nodeId, { ...node.data });
    markDirty();
  }
}

function toDbPayload() {
  if (!draft.value) return {};
  const canvasNodes = canvasRef.value?.getNodes?.() ?? draft.value.nodes;
  const canvasEdges = canvasRef.value?.getEdges?.() ?? draft.value.edges;

  return {
    name: draft.value.name,
    enabled: draft.value.enabled,
    suppressDuplicates: draft.value.suppressDuplicates,
    singleExecution: draft.value.singleExecution,
    nodes: canvasNodes.map((n) => ({
      id: n.id,
      type: n.type ?? '',
      position: n.position,
      data: n.data ?? {},
    })),
    edges: canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
}

async function onSave() {
  if (!draft.value) return;
  syncDraftFromCanvas();
  const payload = toDbPayload();

  try {
    if (isNew.value) {
      const created = await createFlow({ data: payload });
      hasChanges.value = false;
      router.replace(`/automations/${created._id}`);
    } else {
      const updated = await patchFlow({ id: draft.value._id, data: payload });
      hasChanges.value = false;
      // merge server-generated fields (webhook/geofence secrets) back into the draft
      if (updated?.nodes && draft.value) {
        for (const serverNode of updated.nodes) {
          const draftNode = draft.value.nodes.find((n) => n.id === serverNode.id);
          if (draftNode?.data && serverNode.data) {
            Object.assign(draftNode.data, serverNode.data);
          }
        }
      }
      toast.add({ severity: 'success', detail: t('views.automation.saved'), life: 3000 });
    }
  } catch {
    toast.add({ severity: 'error', detail: t('views.automation.save_failed'), life: 3000 });
  }
}

function syncDraftFromCanvas() {
  if (!draft.value) return;
  const canvasNodes = canvasRef.value?.getNodes();
  const canvasEdges = canvasRef.value?.getEdges();
  if (canvasNodes) draft.value.nodes = canvasNodes;
  if (canvasEdges) draft.value.edges = canvasEdges;
}

function onNodeSelect(nodeId: string | null) {
  store.selectedNodeId = nodeId;

  if (smBreakpoint.value && nodeId) {
    // sync draft with canvas before opening the dialog so edges/nodes are current
    syncDraftFromCanvas();

    const node = draft.value?.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const def = node.type ? getNodeDefinition(node.type) : undefined;
    const label = def ? t(def.labelKey) : 'Node';

    const selectedId = node.id;
    dialog.openComponentDialog<CuiAutomationMobileNodeConfigProps>(CuiAutomationMobileNodeConfig, {
      data: {
        title: label,
        confirmText: t('views.automation.delete_node'),
        confirmButtonProps: { severity: 'danger' },
        contentProps: { node: { id: node.id, type: node.type, data: node.data! } },
      },
      onSettled: () => {
        if (!draft.value?.nodes.some((n) => n.id === selectedId)) {
          canvasRef.value?.removeNode(selectedId);
          markDirty();
        }
      },
    });
  }
}

function onMobileAddNode(nodeType: AutomationNodeType) {
  showMobilePalette.value = false;
  canvasRef.value?.addNodeAtCenter(nodeType);
  markDirty();
}

function onDeleteNode() {
  if (store.selectedNodeId) {
    canvasRef.value?.removeNode(store.selectedNodeId);
    if (draft.value) {
      draft.value.nodes = draft.value.nodes.filter((n) => n.id !== store.selectedNodeId);
      draft.value.edges = draft.value.edges.filter((e) => e.source !== store.selectedNodeId && e.target !== store.selectedNodeId);
    }
    store.selectedNodeId = null;
    store.lastOutput = null;
    markDirty();
  }
}

async function onRun() {
  if (!draft.value || isNew.value) return;
  try {
    store.lastOutput = null;
    const result = await triggerFlow({ id: draft.value._id });
    if (result?.output && Object.keys(result.output).length > 0) {
      store.lastOutput = result.output;
    }
    toast.add({ severity: 'success', detail: t('views.automation.triggered'), life: 3000 });
  } catch {
    toast.add({ severity: 'error', detail: t('views.automation.trigger_failed'), life: 3000 });
  }
}

function onExportBlueprint() {
  if (!draft.value) return;
  // save first so the blueprint is up to date
  onSave();
  const blueprint = {
    version: 1,
    name: draft.value.name,
    nodes: stripBlueprintSecrets(draft.value.nodes),
    edges: draft.value.edges,
  };
  const json = JSON.stringify(blueprint, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${draft.value.name.replace(/\s+/g, '_').toLowerCase()}.blueprint.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function confirmClearFlow() {
  dialog.openTextDialog({
    data: {
      title: t('views.automation.clear'),
      contentText: t('views.automation.clear_confirm'),
      confirmText: t('views.automation.clear'),
    },
    onConfirm: async () => {
      canvasRef.value?.clearAll();
      if (draft.value) {
        draft.value.nodes = [];
        draft.value.edges = [];
      }
      store.selectedNodeId = null;
      markDirty();
    },
  });
}

function confirmDeleteFlow() {
  if (!draft.value) return;
  const id = draft.value._id;
  dialog.openTextDialog({
    data: {
      title: t('views.automations.delete'),
      contentText: t('views.automations.delete_confirm'),
      confirmText: t('views.automations.delete'),
    },
    onConfirm: async () => {
      await removeFlow({ id });
      router.push('/automations');
    },
  });
}

function onBack() {
  router.push('/automations');
}

watch(
  flowId,
  (id) => {
    store.activeFlowId = id === 'new' ? null : (id ?? null);
    store.selectedNodeId = null;
    store.lastOutput = null;
    hasChanges.value = false;

    if (id === 'new') {
      loadNewDraft();
    } else {
      // reset draft so the flowData watch fires when data arrives
      draft.value = null;
    }
  },
  { immediate: true },
);

watch(
  flowData,
  (data) => {
    if (data && !hasChanges.value) {
      draft.value = JSON.parse(JSON.stringify(data));
      store.validationIssues = validateDraft(draft.value);
    }
  },
  { immediate: true },
);

watch(
  () => store.draftDirty,
  (dirty) => {
    if (dirty) {
      store.draftDirty = false;
      markDirty();
    }
  },
);

onBeforeRouteLeave((to) => {
  if (!hasChanges.value || leaveConfirmed) return true;
  dialog.openTextDialog({
    data: {
      title: t('views.automation.unsaved_title'),
      contentText: t('views.automation.unsaved_message'),
      confirmText: t('views.automation.discard'),
    },
    onConfirm: async () => {
      leaveConfirmed = true;
      router.push(to.fullPath);
    },
  });
  return false;
});
</script>
