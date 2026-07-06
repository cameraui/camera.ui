import type { AutomationFlow } from '../types.js';

interface VariableOption {
  label: string;
  value: string;
}

export function getAvailableVariables(flow: AutomationFlow | null, nodeId: string): VariableOption[] {
  if (!flow) return [];

  const variables: VariableOption[] = [];
  const visited = new Set<string>();

  collectFromAncestors(flow, nodeId, variables, visited);

  return variables;
}

function collectFromAncestors(flow: AutomationFlow, nodeId: string, variables: VariableOption[], visited: Set<string>): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const edges = flow.edges as { source: string; target: string; sourceHandle?: string }[];
  const nodes = flow.nodes as { id: string; type?: string; data?: Record<string, unknown> }[];

  const sourceIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);

  for (const sourceId of sourceIds) {
    const sourceNode = nodes.find((n) => n.id === sourceId);
    if (!sourceNode?.type) continue;

    const nodeData = sourceNode.data as Record<string, unknown> | undefined;
    const alias = nodeData?.alias as string | undefined;

    addVariablesForNodeType(sourceNode.type, variables, nodeData, alias);

    // Loop nodes also traverse body edges to expose vars from inner nodes
    if (sourceNode.type === 'action-loop') {
      const bodyTargets = edges.filter((e) => e.source === sourceId && e.sourceHandle === 'body').map((e) => e.target);
      for (const bodyTarget of bodyTargets) {
        collectFromDescendants(flow, bodyTarget, variables, new Set(visited));
      }
    }

    collectFromAncestors(flow, sourceId, variables, visited);
  }
}

function collectFromDescendants(flow: AutomationFlow, nodeId: string, variables: VariableOption[], visited: Set<string>): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const node = (flow.nodes as { id: string; type?: string }[]).find((n) => n.id === nodeId);
  if (!node?.type) return;

  addVariablesForNodeType(node.type, variables);

  const edges = flow.edges as { source: string; target: string }[];
  const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);
  for (const childId of childIds) {
    collectFromDescendants(flow, childId, variables, visited);
  }
}

function addVariablesForNodeType(type: string, variables: VariableOption[], data?: Record<string, unknown>, alias?: string): void {
  const existing = new Set(variables.map((v) => v.value));
  const add = (label: string, value: string) => {
    if (alias) {
      const aliasedValue = value.replace(/\{\{/, `{{${alias}.`);
      const aliasedLabel = `${alias}: ${label}`;
      if (!existing.has(aliasedValue)) {
        variables.push({ label: aliasedLabel, value: aliasedValue });
        existing.add(aliasedValue);
      }
    }
    // Unscoped version is always added too
    if (!existing.has(value)) {
      variables.push({ label, value });
      existing.add(value);
    }
  };

  // Repeat variables only emitted when repeat > 1
  if (data?.repeat && Number(data.repeat) > 1) {
    add('Repeat — Index (0-based)', '{{repeat.index}}');
    add('Repeat — Iteration (1-based)', '{{repeat.iteration}}');
    add('Repeat — Total', '{{repeat.total}}');
    add('Repeat — Total Calls', '{{repeat.totalCalls}}');
    add('Repeat — Elapsed (ms)', '{{repeat.elapsedMs}}');
    add('Repeat — Elapsed (sec)', '{{repeat.elapsedSec}}');
  }

  switch (type) {
    case 'trigger-detection':
      add('Event — Confidence', '{{event.confidence}}');
      add('Event — Detection Type', '{{event.type}}');
      add('Event — Label', '{{event.label}}');
      add('Event — Camera', '{{event.cameraId}}');
      add('Event — State', '{{event.state}}');
      add('Event — Faces', '{{event.faces}}');
      add('Event — License Plates', '{{event.plates}}');
      break;

    case 'trigger-sensor':
      add('Sensor — Value', '{{sensor.value}}');
      add('Sensor — Previous Value', '{{sensor.previousValue}}');
      add('Sensor — Property', '{{sensor.property}}');
      break;

    case 'trigger-webhook':
      add('Webhook — Body', '{{webhook.body}}');
      add('Webhook — Data (binary)', '{{webhook.data}}');
      add('Webhook — Method', '{{webhook.method}}');
      break;

    case 'trigger-geofence':
      add('Geo — User', '{{geo.user}}');
      add('Geo — Event', '{{geo.event}}');
      add('Geo — Zone', '{{geo.zone}}');
      add('Geo — Latitude', '{{geo.lat}}');
      add('Geo — Longitude', '{{geo.lon}}');
      add('Geo — Distance (m)', '{{geo.distance}}');
      break;

    case 'trigger-system':
      add('System — Event Type', '{{system.eventType}}');
      add('System — Camera ID', '{{system.cameraId}}');
      add('System — Camera Name', '{{system.cameraName}}');
      add('System — Plugin Name', '{{system.pluginName}}');
      add('System — Plugin ID', '{{system.pluginId}}');
      add('System — Status', '{{system.status}}');
      add('System — Property', '{{system.property}}');
      add('System — Sensor ID', '{{system.sensorId}}');
      add('System — Sensor Type', '{{system.sensorType}}');
      add('System — Sensor Name', '{{system.sensorName}}');
      break;

    case 'action-snapshot':
      add('Snapshot (base64)', '{{snapshot}}');
      add('Snapshot (data URI)', '{{snapshot.base64}}');
      break;

    case 'action-http':
      add('HTTP — Status', '{{http.status}}');
      add('HTTP — Body', '{{http.body}}');
      add('HTTP — Base64 (binary)', '{{http.base64}}');
      break;

    case 'action-plugin':
      add('Plugin — Detected', '{{plugin.detected}}');
      add('Plugin — Labels', '{{plugin.labels}}');
      add('Plugin — Detections (JSON)', '{{plugin.detections}}');
      add('Plugin — Result (JSON)', '{{plugin.result}}');
      add('Plugin — Duration (ms)', '{{plugin.durationMs}}');
      break;

    case 'action-image-input':
      add('Image (base64)', '{{image}}');
      break;

    case 'action-camera-control':
      add('Camera — ID', '{{camera.id}}');
      add('Camera — Name', '{{camera.name}}');
      break;

    case 'action-variable':
      // Can't know the variable name statically
      break;
  }
}
