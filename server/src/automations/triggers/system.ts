import { container } from 'tsyringe';

import { createEmptyContext } from '../context.js';

import type { Disposable } from '@camera.ui/sdk';
import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { InternalEvent, InternalEventBus, InternalEventPayload } from '../../internal-bus.js';
import type { TriggerContext } from './types.js';

export function subscribeSystem(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const category = (triggerNode.data.category as string) ?? 'system';
  const eventType = (triggerNode.data.eventType as string) ?? '';
  const targetId = (triggerNode.data.targetId as string) ?? '';

  if (!eventType) return;

  const bus = container.resolve<InternalEventBus>('internalBus');

  const handler = (payload: InternalEventPayload) => {
    if (category === 'plugin' && targetId && (payload as any).pluginId !== targetId) return;
    if (category === 'camera' && targetId && (payload as any).cameraId !== targetId) return;

    const context = createEmptyContext();
    context.system = { eventType };

    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        context.system[key as keyof typeof context.system] = String(value);
      }
    }

    ctx.executeFlow(flow, triggerNode, context);
  };

  bus.onEvent(eventType as InternalEvent, handler);

  const disposable: Disposable = {
    dispose: () => bus.offEvent(eventType as InternalEvent, handler),
  } as Disposable;

  ctx.addSubscription(flow._id, disposable);
  ctx.logger.trace(`Automation "${flow.name}": Subscribed to ${category} event "${eventType}" (target: ${targetId || 'any'})`);
}
