import type { AutomationEdge, AutomationNode } from './types.js';

export interface FlowSnapshot {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

const MAX_HISTORY = 50;

export function useFlowHistory() {
  // Store as serialized strings to avoid deep Vue Flow type recursion with ref<>
  const undoStack = shallowRef<string[]>([]);
  const redoStack = shallowRef<string[]>([]);

  function serialize(nodes: AutomationNode[], edges: AutomationEdge[]): string {
    return JSON.stringify({ nodes, edges });
  }

  function deserialize(snapshot: string): FlowSnapshot {
    return JSON.parse(snapshot);
  }

  function push(nodes: AutomationNode[], edges: AutomationEdge[]) {
    const stack = [...undoStack.value, serialize(nodes, edges)];
    if (stack.length > MAX_HISTORY) stack.shift();
    undoStack.value = stack;
    redoStack.value = [];
  }

  function undo(currentNodes: AutomationNode[], currentEdges: AutomationEdge[]): FlowSnapshot | undefined {
    const stack = [...undoStack.value];
    const prev = stack.pop();
    if (!prev) return undefined;
    undoStack.value = stack;
    redoStack.value = [...redoStack.value, serialize(currentNodes, currentEdges)];
    return deserialize(prev);
  }

  function redo(currentNodes: AutomationNode[], currentEdges: AutomationEdge[]): FlowSnapshot | undefined {
    const stack = [...redoStack.value];
    const next = stack.pop();
    if (!next) return undefined;
    redoStack.value = stack;
    undoStack.value = [...undoStack.value, serialize(currentNodes, currentEdges)];
    return deserialize(next);
  }

  function clear() {
    undoStack.value = [];
    redoStack.value = [];
  }

  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  return { push, undo, redo, clear, canUndo, canRedo };
}
