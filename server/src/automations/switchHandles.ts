import type { DBAutomationEdge, DBAutomationNode } from '../api/database/types.js';

export function caseHandleId(value: string): string {
  return `case-${encodeURIComponent(value)}`;
}

export function readSwitchCases(data: Record<string, unknown>): string[] {
  const raw = Array.isArray(data.cases) ? data.cases.filter((c): c is string => typeof c === 'string') : [];
  return [...new Set(raw)];
}

export interface NormalizeSwitchResult {
  changed: boolean;
  droppedEdges: number;
}

export function normalizeSwitchCaseHandles(flow: { nodes: DBAutomationNode[]; edges: DBAutomationEdge[] }): NormalizeSwitchResult {
  let changed = false;
  let droppedEdges = 0;
  const surplus = new Set<DBAutomationEdge>();

  for (const node of flow.nodes) {
    if (node.type !== 'condition-switch') continue;

    const raw: unknown[] = Array.isArray(node.data.cases) ? node.data.cases : [];
    const reachable = raw.map((c, i) => (typeof c === 'string' && raw.indexOf(c) === i ? c : undefined));

    const outgoing = flow.edges.filter((e) => e.source === node.id);
    for (const [index, edge] of outgoing.entries()) {
      const value = reachable[index];
      if (value === undefined) {
        surplus.add(edge);
        droppedEdges++;
        changed = true;
        continue;
      }

      const handle = caseHandleId(value);
      if (edge.sourceHandle !== handle) {
        edge.sourceHandle = handle;
        changed = true;
      }
    }

    const cases = readSwitchCases(node.data);
    if (raw.length !== cases.length || cases.some((c, i) => raw[i] !== c)) {
      node.data.cases = cases;
      changed = true;
    }
  }

  if (surplus.size > 0) {
    flow.edges = flow.edges.filter((e) => !surplus.has(e));
  }

  return { changed, droppedEdges };
}
