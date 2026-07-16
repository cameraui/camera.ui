import { uuidv4 } from '@camera.ui/common/utils';

import type { AutomationNode, AutomationNodeData } from './types.js';

const INHERITABLE_FIELDS = ['cameraId', 'sensorType', 'sensorName', 'sensorPluginId', 'property'] as const;

export function inheritFieldsFromSource(sourceData: AutomationNodeData | undefined, targetData: AutomationNodeData | undefined): Record<string, unknown> | null {
  if (!sourceData || !targetData) return null;

  const updates: Record<string, unknown> = {};
  const src = sourceData as unknown as Record<string, unknown>;
  const tgt = targetData as unknown as Record<string, unknown>;

  for (const field of INHERITABLE_FIELDS) {
    // Only inherit if source has a value and target field exists but is empty
    if (src[field] && field in tgt && !tgt[field]) {
      updates[field] = src[field];
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

export function initNodeData(data: AutomationNodeData): AutomationNodeData {
  if (data.type === 'trigger-webhook' && !data.webhookId) {
    return { ...data, webhookId: uuidv4() };
  }
  if (data.type === 'trigger-geofence' && !data.geofenceId) {
    return { ...data, geofenceId: uuidv4() };
  }
  return data;
}

export function getNodeSummary(node: AutomationNode): string | undefined {
  const data = node.data;
  if (!data) return undefined;

  switch (data.type) {
    case 'trigger-detection':
      return data.cameraId || undefined;
    case 'trigger-sensor':
      return data.sensorType || undefined;
    case 'trigger-schedule':
      return data.cron || undefined;
    case 'trigger-webhook':
      return data.webhookId ? `...${data.webhookId.slice(-8)}` : undefined;
    case 'trigger-system':
      return data.eventType ? `${data.category}: ${data.eventType.split(':').pop()}` : undefined;
    case 'trigger-manual':
      return undefined;
    case 'trigger-geofence':
      return data.zoneName || undefined;
    case 'trigger-mqtt':
      return data.topic || undefined;
    case 'condition-ifelse':
      return data.leftOperand && data.operator ? `${data.leftOperand} ${data.operator} ${data.rightOperand}` : undefined;
    case 'condition-switch':
      return data.variable || undefined;
    case 'condition-sensorstate':
      return data.sensorType || undefined;
    case 'condition-time':
      return data.startTime && data.endTime ? `${data.startTime} - ${data.endTime}` : undefined;
    case 'action-snapshot':
      return data.cameraId || undefined;
    case 'action-camera-control':
      return data.cameraId || undefined;
    case 'action-sensor':
      return data.sensorType || undefined;
    case 'action-notification':
      return data.title || undefined;
    case 'action-http':
      return data.url ? `${data.method} ${data.url}` : undefined;
    case 'action-mqtt':
      return data.topic || undefined;
    case 'action-delay':
      return `${data.duration} ${data.unit}`;
    case 'action-variable':
      return data.variableName || undefined;
    default:
      return undefined;
  }
}
