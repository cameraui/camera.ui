import { randomBytes } from 'node:crypto';

import type { DBAutomationEdge, DBAutomationNode } from '../api/database/types.js';

export interface CatalogField {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface CatalogNode {
  type: string;
  description: string;
  fields: CatalogField[];
  handles?: string[];
}

export interface FlowNodeInput {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface FlowEdgeInput {
  source: string;
  target: string;
  sourceHandle?: string;
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const LAYOUT_X = 320;
const LAYOUT_Y = 192;
const LAYOUT_ROW = 224;
const LAYOUT_COLUMN = 280;

export const AUTOMATION_CATALOG: CatalogNode[] = [
  {
    type: 'trigger-detection',
    description: 'Fires when a camera detects something. Exactly one trigger per automation.',
    fields: [
      { name: 'cameraId', type: 'string', required: true, description: 'Camera id from the cameras list' },
      {
        name: 'eventPhase',
        type: 'string[]',
        description: 'start | update | end | segment-start | segment-update | segment-end; empty = any. Use ["start"] for one notification per event',
      },
      { name: 'detectionLabels', type: 'string[]', description: 'motion | person | vehicle | animal | audio; empty = any' },
      { name: 'confidenceThreshold', type: 'number', description: '0 to 1, minimum detection confidence' },
      { name: 'faceFilter', type: 'string[]', description: 'Known face names that must appear' },
      { name: 'licensePlateFilter', type: 'string[]', description: 'License plates that must appear' },
      { name: 'audioLabels', type: 'string[]', description: 'Audio labels such as doorbell, glass_break, dog_bark' },
    ],
  },
  {
    type: 'trigger-sensor',
    description: 'Fires when a sensor property changes.',
    fields: [
      { name: 'sensorId', type: 'string', required: true, description: 'Sensor id from the sensors list' },
      { name: 'properties', type: 'string[]', description: 'Property names to watch; empty = any' },
    ],
  },
  {
    type: 'trigger-schedule',
    description: 'Fires on a schedule.',
    fields: [{ name: 'cron', type: 'string', required: true, description: 'Five field cron, e.g. "0 20 * * *" for 20:00 daily, "*/15 * * * *" every 15 minutes' }],
  },
  {
    type: 'trigger-system',
    description:
      'Fires on a system event. With category plugin and eventType plugin:notification it fires on every push notification that plugin sends, ' +
      'so any plugin alert becomes a trigger: follow it with condition-ifelse on {{system.title}} or a data field such as {{system.type}} ' +
      '(text-alert, detection, episode) and {{system.alertTitle}}.',
    fields: [
      { name: 'category', type: 'string', required: true, description: 'system | plugin | camera' },
      {
        name: 'eventType',
        type: 'string',
        required: true,
        description:
          'system:started | system:shutdown | plugin:started | plugin:stopped | plugin:error | plugin:notification | ' +
          'camera:connected | camera:disconnected | camera:added | camera:removed',
      },
      { name: 'targetId', type: 'string', description: 'Plugin or camera id to restrict to; empty = any' },
    ],
  },
  {
    type: 'trigger-manual',
    description: 'Runs only when started by hand or by the assistant.',
    fields: [],
  },
  {
    type: 'condition-time',
    description: 'Continues on "true" inside the time window, "false" outside. Overnight windows like 22:00 to 06:00 work.',
    fields: [
      { name: 'startTime', type: 'string', required: true, description: 'HH:MM' },
      { name: 'endTime', type: 'string', required: true, description: 'HH:MM' },
      { name: 'days', type: 'number[]', description: 'Weekdays 0 (Sunday) to 6; empty = every day' },
    ],
    handles: ['true', 'false'],
  },
  {
    type: 'condition-ifelse',
    description: 'Compares two values, templates allowed. Continues on "true" or "false".',
    fields: [
      { name: 'leftOperand', type: 'string', required: true, description: 'Value or template, e.g. {{event.label}}' },
      { name: 'operator', type: 'string', required: true, description: '== | != | > | < | >= | <= | contains | startsWith | endsWith' },
      { name: 'rightOperand', type: 'string', required: true, description: 'Value to compare with' },
    ],
    handles: ['true', 'false'],
  },
  {
    type: 'condition-sensorstate',
    description: 'Checks the live state of a sensor. Continues on "true" or "false".',
    fields: [
      { name: 'sensorId', type: 'string', required: true, description: 'Sensor id' },
      { name: 'conditions', type: '{property: string, expectedValue: string}[]', required: true, description: 'Properties and the values they must have' },
      { name: 'logic', type: 'string', description: 'AND | OR, default AND' },
    ],
    handles: ['true', 'false'],
  },
  {
    type: 'action-notification',
    description: 'Sends a push notification to the devices of the users; empty targets = every user.',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Title, templates allowed' },
      { name: 'body', type: 'string', description: 'Text, templates allowed' },
      { name: 'severity', type: 'string', description: 'info | warn | error | critical' },
      { name: 'image', type: 'string', description: 'Use {{snapshot.base64}} after an action-snapshot to attach the picture' },
    ],
  },
  {
    type: 'action-assistant',
    description:
      'Asks the assistant with a prompt built from the flow variables and sends the answer to one user as push, as a conversation, or only into {{assistant.answer}}. ' +
      'The assistant answers NO_REPLY when nothing is worth telling, then nothing is sent and {{assistant.replied}} is false.',
    fields: [
      { name: 'user', type: 'string', required: true, description: 'Username who receives the answer' },
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'Question or task, templates allowed, e.g. "Look at the picture: is this a delivery? {{event.labels}}"',
      },
      { name: 'image', type: 'string', description: 'Use {{snapshot.base64}} after an action-snapshot to let the assistant see the picture' },
      { name: 'deliver', type: 'string', description: 'push (default) | thread | both | none' },
      { name: 'title', type: 'string', description: 'Push title, templates allowed, defaults to the flow name' },
    ],
  },
  {
    type: 'action-snapshot',
    description: 'Takes a picture of a camera and stores it in {{snapshot.base64}} for the following nodes.',
    fields: [
      { name: 'cameraId', type: 'string', required: true, description: 'Camera id' },
      { name: 'forceNew', type: 'boolean', description: 'true = fresh frame instead of the cached one' },
    ],
  },
  {
    type: 'action-sensor',
    description: 'Sets properties of a writable sensor, for example a light, siren, lock or virtual switch.',
    fields: [
      { name: 'sensorId', type: 'string', required: true, description: 'Sensor id' },
      {
        name: 'properties',
        type: '{property: string, value: string}[]',
        required: true,
        description: 'Command property and value as string, e.g. [{"property":"on","value":"true"}]',
      },
    ],
  },
  {
    type: 'action-camera-control',
    description: 'Changes a camera setting, for example disabling it.',
    fields: [
      { name: 'cameraId', type: 'string', required: true, description: 'Camera id' },
      {
        name: 'properties',
        type: '{property: string, value: string}[]',
        required: true,
        description: 'Setting path and value, e.g. [{"property":"disabled","value":"true"}]',
      },
    ],
  },
  {
    type: 'action-delay',
    description: 'Waits before the next node.',
    fields: [
      { name: 'duration', type: 'number', required: true, description: 'Amount' },
      { name: 'unit', type: 'string', required: true, description: 'seconds | minutes | hours' },
    ],
  },
  {
    type: 'action-http',
    description: 'Calls a URL.',
    fields: [
      { name: 'url', type: 'string', required: true, description: 'Full URL, templates allowed' },
      { name: 'method', type: 'string', description: 'GET | POST | PUT | PATCH | DELETE, default GET' },
      { name: 'body', type: 'string', description: 'Request body for POST and PUT' },
    ],
  },
  {
    type: 'action-variable',
    description: 'Stores a value under a name for later templates {{name}}.',
    fields: [
      { name: 'variableName', type: 'string', required: true, description: 'Letters, digits and underscore only' },
      { name: 'value', type: 'string', required: true, description: 'Value or template' },
      { name: 'operator', type: 'string', description: '= (set) | += (add) | -= (subtract), default =' },
    ],
  },
];

export const AUTOMATION_VARIABLES: Record<string, string[]> = {
  'trigger-detection': ['{{event.id}}', '{{event.type}}', '{{event.label}}', '{{event.confidence}}', '{{event.faces}}', '{{event.plates}}', '{{event.cameraId}}'],
  'trigger-sensor': ['{{sensor.value}}', '{{sensor.previousValue}}', '{{sensor.property}}', '{{sensor.sensorType}}'],
  'trigger-system': [
    '{{system.pluginName}}',
    '{{system.cameraName}}',
    '{{system.cameraId}}',
    '{{system.title}}',
    '{{system.body}}',
    '{{system.tag}}',
    '{{system.type}}',
    '{{system.alertTitle}}',
    '{{system.eventId}}',
  ],
  'action-snapshot': ['{{snapshot.base64}}'],
};

export interface BuiltFlow {
  nodes: DBAutomationNode[];
  edges: DBAutomationEdge[];
}

export function buildFlow(nodes: FlowNodeInput[], edges: FlowEdgeInput[]): { flow: BuiltFlow } | { errors: string[] } {
  const errors: string[] = [];
  const known = new Map(AUTOMATION_CATALOG.map((node) => [node.type, node]));
  const ids = new Set<string>();

  if (!nodes.length) errors.push('An automation needs at least a trigger and one action.');

  for (const node of nodes) {
    if (!ID_PATTERN.test(node.id)) errors.push(`Node id "${node.id}" must be 1 to 64 letters, digits, "_" or "-".`);
    if (ids.has(node.id)) errors.push(`Node id "${node.id}" is used twice.`);
    ids.add(node.id);

    const spec = known.get(node.type);
    if (!spec) {
      errors.push(`Unknown node type "${node.type}". Call automation_catalog for the supported types.`);
      continue;
    }
    for (const field of spec.fields) {
      if (field.required && (node.data?.[field.name] === undefined || node.data[field.name] === '')) {
        errors.push(`Node "${node.id}" (${node.type}) is missing "${field.name}".`);
      }
    }
  }

  const triggers = nodes.filter((node) => node.type.startsWith('trigger-'));
  if (triggers.length !== 1) errors.push(`Exactly one trigger node is required, found ${triggers.length}.`);
  if (!nodes.some((node) => node.type.startsWith('action-'))) errors.push('At least one action node is required.');

  for (const edge of edges) {
    if (!ids.has(edge.source)) errors.push(`Edge source "${edge.source}" is not a node.`);
    if (!ids.has(edge.target)) errors.push(`Edge target "${edge.target}" is not a node.`);
    const source = nodes.find((node) => node.id === edge.source);
    const spec = source ? known.get(source.type) : undefined;
    if (spec?.handles && (!edge.sourceHandle || !spec.handles.includes(edge.sourceHandle))) {
      errors.push(`Edge from "${edge.source}" needs sourceHandle ${spec.handles.map((h) => `"${h}"`).join(' or ')}.`);
    }
    if (source && !spec?.handles && edge.sourceHandle) errors.push(`Edge from "${edge.source}" must not carry a sourceHandle.`);
  }

  const reachable = new Set<string>();
  const queue = triggers.map((node) => node.id);
  while (queue.length) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const edge of edges) if (edge.source === current) queue.push(edge.target);
  }
  for (const node of nodes) {
    if (!reachable.has(node.id) && !node.type.startsWith('trigger-')) errors.push(`Node "${node.id}" is not connected to the trigger.`);
  }

  if (errors.length) return { errors };

  const depth = new Map<string, number>();
  const order: string[] = [];
  const walk = [{ id: triggers[0].id, level: 0 }];
  while (walk.length) {
    const { id, level } = walk.shift()!;
    if (depth.has(id)) continue;
    depth.set(id, level);
    order.push(id);
    for (const edge of edges) if (edge.source === id) walk.push({ id: edge.target, level: level + 1 });
  }

  const perLevel = new Map<number, number>();
  const positioned: DBAutomationNode[] = order.map((id) => {
    const node = nodes.find((n) => n.id === id)!;
    const level = depth.get(id) ?? 0;
    const index = perLevel.get(level) ?? 0;
    perLevel.set(level, index + 1);
    return {
      id: node.id,
      type: node.type,
      position: { x: LAYOUT_X + index * LAYOUT_COLUMN, y: LAYOUT_Y + level * LAYOUT_ROW },
      data: { ...(node.data ?? {}), type: node.type },
    };
  });

  const builtEdges: DBAutomationEdge[] = edges.map((edge) => ({
    id: `e-${edge.source}-${edge.sourceHandle ?? 'out'}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
  }));

  return { flow: { nodes: positioned, edges: builtEdges } };
}

export function newNodeId(): string {
  return randomBytes(6).toString('hex');
}
