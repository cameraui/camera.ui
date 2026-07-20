import type { FlowIssue } from '@/components/CuiAutomation/config/flowValidation.js';
import type { AutomationFlow, AutomationNode } from '@/components/CuiAutomation/types.js';

export const useAutomationsStore = defineStore('automations', () => {
  const activeFlowId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const draft = ref<AutomationFlow | null>(null);
  const draftDirty = ref(false);
  const lastOutput = ref<Record<string, string> | null>(null);
  const validationIssues = ref<FlowIssue[]>([]);

  function getDraftSourceNode(nodeId: string): AutomationNode | undefined {
    if (!draft.value) return undefined;
    const edges = draft.value.edges as unknown as { source: string; target: string }[];
    const nodes = draft.value.nodes as unknown as AutomationNode[];
    const sourceIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
    return nodes.find((n) => sourceIds.includes(n.id));
  }

  return {
    activeFlowId,
    selectedNodeId,
    draft,
    draftDirty,
    lastOutput,
    validationIssues,
    getDraftSourceNode,
  };
});
