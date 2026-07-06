import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';

export interface WebhookMapping {
  flowId: string;
  nodeId: string;
  secret?: string;
}

export function registerWebhook(webhookMap: Map<string, WebhookMapping>, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const webhookId = triggerNode.data.webhookId as string;
  if (!webhookId) return;
  const secret = triggerNode.data.webhookSecret as string | undefined;
  webhookMap.set(webhookId, { flowId: flow._id, nodeId: triggerNode.id, secret });
}
