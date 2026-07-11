import { container } from 'tsyringe';

import { createEmptyContext } from '../context.js';

import type { Disposable } from '@camera.ui/sdk';
import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { MqttManager } from '../../mqtt/manager.js';
import type { TriggerContext } from './types.js';

export function subscribeMqtt(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const topic = ((triggerNode.data.topic as string) ?? '').trim();
  const payloadFilter = ((triggerNode.data.payloadFilter as string) ?? '').trim();

  if (!topic) return;

  const mqttManager = container.resolve<MqttManager>('mqttManager');

  const unsubscribe = mqttManager.subscribeTrigger(topic, (messageTopic, payload) => {
    if (payloadFilter && payload.trim() !== payloadFilter) return;

    const context = createEmptyContext();
    context.mqtt = { topic: messageTopic, payload };

    ctx.executeFlow(flow, triggerNode, context);
  });

  ctx.addSubscription(flow._id, { dispose: unsubscribe } as Disposable);
  ctx.logger.trace(`Automation "${flow.name}": Subscribed to MQTT topic "${topic}"${payloadFilter ? ` (payload == "${payloadFilter}")` : ''}`);
}
