<template>
  <div
    ref="canvasRef"
    class="h-full w-full border-left-color border-bottom-color border-right-color rounded-b-xl overflow-hidden"
    :class="{
      'rounded-none! border-0!': smBreakpoint,
    }"
    @drop="onDrop"
    @dragover.prevent
    @dragenter.prevent
  >
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :default-viewport="{ zoom: mobile ? 0.7 : 0.9, x: 0, y: 0 }"
      :snap-to-grid="true"
      :snap-grid="[16, 16]"
      :is-valid-connection="isValidConnection"
      class="automation-canvas"
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
      @connect="onConnect"
      @nodes-change="onNodesChange"
    >
      <Background :gap="16" />
      <Controls />

      <template v-if="!nodes.length" #default>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span class="text-muted text-sm">{{ mobile ? t('views.automation.no_nodes_mobile') : t('views.automation.no_nodes') }}</span>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { useVueFlow, VueFlow } from '@vue-flow/core';

import { randomLetter } from '@/common/utils.js';
import DeletableEdge from './edges/DeletableEdge.vue';
import { getNodeDefinition } from './nodeDefinitions.js';
import ActionNode from './nodes/ActionNode.vue';
import ConditionNode from './nodes/ConditionNode.vue';
import TriggerNode from './nodes/TriggerNode.vue';
import { useFlowHistory } from './useFlowHistory.js';
import { inheritFieldsFromSource, initNodeData } from './utils.js';

import type { Connection, NodeChange, NodeMouseEvent } from '@vue-flow/core';
import type { AutomationEdge, AutomationNode, AutomationNodeType, CuiAutomationCanvasEmits, CuiAutomationCanvasProps } from './types.js';

const props = defineProps<CuiAutomationCanvasProps>();

const emit = defineEmits<CuiAutomationCanvasEmits>();

const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { screenToFlowCoordinate, getViewport, dimensions } = useVueFlow();
const history = useFlowHistory();

const nodeTypes: Record<string, any> = {
  'trigger-detection': markRaw(TriggerNode),
  'trigger-sensor': markRaw(TriggerNode),
  'trigger-schedule': markRaw(TriggerNode),
  'trigger-webhook': markRaw(TriggerNode),
  'trigger-system': markRaw(TriggerNode),
  'trigger-manual': markRaw(TriggerNode),
  'trigger-geofence': markRaw(TriggerNode),
  'condition-ifelse': markRaw(ConditionNode),
  'condition-switch': markRaw(ConditionNode),
  'condition-sensorstate': markRaw(ConditionNode),
  'condition-time': markRaw(ConditionNode),
  'action-snapshot': markRaw(ActionNode),
  'action-sensor': markRaw(ActionNode),
  'action-notification': markRaw(ActionNode),
  'action-http': markRaw(ActionNode),
  'action-delay': markRaw(ActionNode),
  'action-variable': markRaw(ActionNode),
  'action-plugin': markRaw(ActionNode),
  'action-camera-control': markRaw(ActionNode),
  'action-image-input': markRaw(ActionNode),
  'action-output': markRaw(ActionNode),
};

const edgeTypes: Record<string, any> = {
  default: markRaw(DeletableEdge),
};

const nodes = ref([...props.flow.nodes]) as Ref<AutomationNode[]>;
const edges = ref([...props.flow.edges]) as Ref<AutomationEdge[]>;

function pushHistory() {
  history.push(nodes.value, edges.value);
}

function undoFlow() {
  const prev = history.undo(nodes.value, edges.value);
  if (prev) {
    nodes.value = prev.nodes;
    edges.value = prev.edges;
    emit('node-select', null);
    emit('change');
  }
}

function redoFlow() {
  const next = history.redo(nodes.value, edges.value);
  if (next) {
    nodes.value = next.nodes;
    edges.value = next.edges;
    emit('node-select', null);
    emit('change');
  }
}

function onNodeClick(event: NodeMouseEvent) {
  emit('node-select', event.node.id);
}

function onPaneClick() {
  emit('node-select', null);
}

function isValidConnection(connection: Connection): boolean {
  const sourceNode = nodes.value.find((n) => n.id === connection.source);
  const targetNode = nodes.value.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;

  if (connection.source === connection.target) return false;

  // Triggers have no input
  if (targetNode.type?.startsWith('trigger-')) return false;

  return true;
}

function onConnect(connection: Connection) {
  if (!isValidConnection(connection)) return;

  pushHistory();

  const targetHandle = connection.targetHandle ?? undefined;
  const targetNode = nodes.value.find((n) => n.id === connection.target);
  const isCondition = targetNode?.type?.startsWith('condition-');

  // Conditions have max 1 input — replace existing incoming edge
  if (isCondition) {
    const existingIncoming = edges.value.find((e) => e.target === connection.target && (e.targetHandle ?? undefined) === targetHandle);
    if (existingIncoming) {
      edges.value = edges.value.filter((e) => e.id !== existingIncoming.id);
    }
  }

  const edge: AutomationEdge = {
    id: `e-${connection.source}-${connection.target}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: targetHandle,
  };
  edges.value.push(edge);

  // Inherit matching fields from source — only fills empty target fields
  const sourceNode = nodes.value.find((n) => n.id === connection.source);
  const updates = inheritFieldsFromSource(sourceNode?.data, targetNode?.data);
  if (updates && targetNode?.data) {
    Object.assign(targetNode.data, updates);
  }

  emit('change');
}

function onNodesChange(changes: NodeChange[]) {
  const hasRemoval = changes.some((c) => c.type === 'remove');
  if (hasRemoval) {
    pushHistory();
    emit('node-select', null);
    emit('change');
  }
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/automationnode') as AutomationNodeType | undefined;
  if (!nodeType) return;

  const definition = getNodeDefinition(nodeType);
  if (!definition) return;

  pushHistory();

  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });

  const node: AutomationNode = {
    id: randomLetter(12),
    type: nodeType,
    position,
    data: initNodeData({ ...definition.defaults }),
  };

  nodes.value = [...nodes.value, node];
  emit('change');
}

function addNodeAtCenter(nodeType: AutomationNodeType): AutomationNode | undefined {
  const definition = getNodeDefinition(nodeType);
  if (!definition) return undefined;

  pushHistory();

  const { x: vpX, y: vpY, zoom } = getViewport();
  const { width, height } = dimensions.value;
  const centerX = (-vpX + width / 2) / zoom;
  const centerY = (-vpY + height / 2) / zoom;

  // Random offset prevents nodes stacking exactly
  const offset = () => (Math.random() - 0.5) * 80;

  const node: AutomationNode = {
    id: randomLetter(12),
    type: nodeType,
    position: { x: centerX + offset(), y: centerY + offset() },
    data: initNodeData({ ...definition.defaults }),
  };

  nodes.value = [...nodes.value, node];
  emit('change');
  return node;
}

function removeNode(nodeId: string) {
  pushHistory();
  nodes.value = nodes.value.filter((n) => n.id !== nodeId);
  edges.value = edges.value.filter((e) => e.source !== nodeId && e.target !== nodeId);
  emit('change');
}

function clearAll() {
  pushHistory();
  nodes.value = [];
  edges.value = [];
  emit('change');
}

function getNodes() {
  return [...nodes.value] as AutomationNode[];
}

function getEdges() {
  return [...edges.value] as AutomationEdge[];
}

function updateNodeData(nodeId: string, data: Record<string, unknown>) {
  const node = nodes.value.find((n) => n.id === nodeId);
  if (node) {
    node.data = data as unknown as AutomationNode['data'];
  }
}

function onKeyDown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undoFlow();
  } else if (mod && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redoFlow();
  } else if (mod && e.key === 'y') {
    e.preventDefault();
    redoFlow();
  }
}

// Sync from store → canvas only on flow identity change, not deep
watch(
  () => props.flow._id,
  () => {
    nodes.value = [...props.flow.nodes];
    edges.value = [...props.flow.edges];
    history.clear();
  },
);

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));

defineExpose({
  removeNode,
  addNodeAtCenter,
  clearAll,
  getNodes,
  getEdges,
  updateNodeData,
  undo: undoFlow,
  redo: redoFlow,
  canUndo: history.canUndo,
  canRedo: history.canRedo,
});
</script>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/minimap/dist/style.css';
@import '@vue-flow/controls/dist/style.css';

.automation-canvas {
  --vf-node-bg: var(--card-background);
  --vf-node-text: var(--text-color);
  --vf-connection-path: var(--text-muted-color);
  --vf-handle: var(--text-muted-color);
  background: var(--content-background);
}

.automation-canvas .vue-flow__minimap-mask {
  fill: var(--mask-background);
}

.automation-canvas .vue-flow__controls-button {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  fill: var(--text-color);
}

.automation-canvas .vue-flow__controls-button:hover {
  background: var(--card-background);
  border-color: var(--border-color-inner);
  color: var(--text-color);
  fill: var(--text-color);
}
</style>
