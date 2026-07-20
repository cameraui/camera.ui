import { getFlowVariables } from './flowSchema.js';

import type { AutomationFlow } from '../types.js';

export interface FlowIssue {
  nodeId?: string;
  messageKey: string;
  params?: Record<string, unknown>;
}

interface RawNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  'trigger-detection': ['cameraId'],
  'trigger-sensor': ['cameraId', 'sensorName'],
  'trigger-schedule': ['cron'],
  'trigger-mqtt': ['topic'],
  'trigger-system': ['eventType'],
  'condition-switch': ['variable'],
  'condition-ifelse': ['leftOperand', 'operator'],
  'condition-sensorstate': ['cameraId', 'sensorName'],
  'condition-time': ['startTime', 'endTime'],
  'action-snapshot': ['cameraId'],
  'action-sensor': ['cameraId', 'sensorName'],
  'action-notification': ['title'],
  'action-http': ['url'],
  'action-mqtt': ['topic'],
  'action-variable': ['variableName'],
  'action-plugin': ['pluginName', 'method'],
  'action-camera-control': ['cameraId'],
  'action-image-input': ['source'],
};

// families whose members are dynamic (http.<jsonKey>, webhook.<bodyKey>, ...): any
// member passes as long as the family itself is produced upstream
const DYNAMIC_FAMILIES = new Set(['http', 'mqtt', 'webhook', 'sensor', 'system', 'repeat', 'previous', 'plugin', 'camera', 'geo', 'event']);
const GLOBAL_VARIABLES = new Set(['time.now', 'flow.startMs', 'snapshot', 'snapshot.base64', 'output']);

export function validateDraft(flow: AutomationFlow | null): FlowIssue[] {
  if (!flow) return [];

  const issues: FlowIssue[] = [];
  const nodes = flow.nodes as unknown as RawNode[];
  const edges = flow.edges as unknown as { source: string; target: string }[];

  const triggers = nodes.filter((n) => n.type?.startsWith('trigger-'));
  if (triggers.length === 0) {
    issues.push({ messageKey: 'validation_no_trigger' });
  }

  const reachable = new Set(triggers.map((n) => n.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        grew = true;
      }
    }
  }

  for (const node of nodes) {
    if (!node.type) continue;
    const data = node.data ?? {};

    if (!node.type.startsWith('trigger-') && !reachable.has(node.id)) {
      issues.push({ nodeId: node.id, messageKey: 'validation_unreachable' });
    }

    for (const field of REQUIRED_FIELDS[node.type] ?? []) {
      const value = data[field];
      if (value === undefined || value === null || value === '') {
        issues.push({ nodeId: node.id, messageKey: 'validation_missing_fields' });
        break;
      }
    }

    if (node.type === 'condition-switch' && (!Array.isArray(data.cases) || data.cases.length === 0)) {
      issues.push({ nodeId: node.id, messageKey: 'validation_no_cases' });
    }

    if (node.type === 'trigger-schedule' && typeof data.cron === 'string' && data.cron && data.cron.trim().split(/\s+/).length !== 5) {
      issues.push({ nodeId: node.id, messageKey: 'validation_invalid_cron' });
    }

    if (node.type === 'action-variable' && typeof data.variableName === 'string' && data.variableName && !/^\w+(?:\.\w+)*$/.test(data.variableName)) {
      issues.push({ nodeId: node.id, messageKey: 'validation_invalid_variable_name' });
    }

    issues.push(...checkTemplates(flow, node));
  }

  return issues;
}

function checkTemplates(flow: AutomationFlow, node: RawNode): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const known = new Set(getFlowVariables(flow, node.id).map((v) => v.template.slice(2, -2)));
  const knownFamilies = new Set([...known].map((name) => name.split('.')[0]));
  const userVariables = collectUserVariableNames(flow);

  const templates: string[] = [];
  collectStrings(node.data ?? {}, templates);

  const flagged = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g)) {
      const name = match[1];
      if (known.has(name) || GLOBAL_VARIABLES.has(name) || userVariables.has(name) || flagged.has(name)) continue;
      const family = name.split('.')[0];
      if (DYNAMIC_FAMILIES.has(family) && knownFamilies.has(family)) continue;
      if (userVariables.has(family)) continue;
      flagged.add(name);
      issues.push({ nodeId: node.id, messageKey: 'validation_unknown_variable', params: { name } });
    }
  }

  return issues;
}

function collectUserVariableNames(flow: AutomationFlow): Set<string> {
  const names = new Set<string>();
  for (const node of flow.nodes as unknown as RawNode[]) {
    const data = node.data ?? {};
    if (node.type === 'action-variable' && typeof data.variableName === 'string' && data.variableName) names.add(data.variableName);
    if (node.type === 'action-image-input') names.add(typeof data.variableName === 'string' && data.variableName ? data.variableName : 'image');
    if (typeof data.alias === 'string' && data.alias) names.add(data.alias);
  }
  return names;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value.includes('{{')) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
}

export function useNodeIssues(nodeId: MaybeRefOrGetter<string>) {
  const store = useAutomationsStore();
  const { t } = useI18n();

  return computed(() => {
    const issues = store.validationIssues.filter((issue) => issue.nodeId === toValue(nodeId));
    if (issues.length === 0) return undefined;
    return issues.map((issue) => t(`components.automation_nodes.${issue.messageKey}`, issue.params ?? {})).join('\n');
  });
}
