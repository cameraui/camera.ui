import { container } from 'tsyringe';

import { createEmptyContext } from '../context.js';

import type { Disposable } from '@camera.ui/sdk';
import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { MqttManager } from '../../mqtt/manager.js';
import type { TriggerContext } from './types.js';

type MatchMode = 'any' | 'exact' | 'json';

export function subscribeMqtt(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const topic = ((triggerNode.data.topic as string) ?? '').trim();
  if (!topic) return;

  const mode = (triggerNode.data.matchMode as MatchMode) ?? 'any';
  const payloadFilter = ((triggerNode.data.payloadFilter as string) ?? '').trim();
  const jsonPath = ((triggerNode.data.jsonPath as string) ?? '').trim();
  const jsonValue = ((triggerNode.data.jsonValue as string) ?? '').trim();

  const mqttManager = container.resolve<MqttManager>('mqttManager');

  const unsubscribe = mqttManager.subscribeTrigger(topic, (messageTopic, payload) => {
    if (!payloadMatches(mode, payload, { payloadFilter, jsonPath, jsonValue })) return;

    const context = createEmptyContext();
    context.mqtt = { topic: messageTopic, payload };

    ctx.executeFlow(flow, triggerNode, context);
  });

  ctx.addSubscription(flow._id, { dispose: unsubscribe } as Disposable);
  ctx.logger.trace(`Automation "${flow.name}": Subscribed to MQTT topic "${topic}" (match: ${mode})`);
}

function payloadMatches(mode: MatchMode, payload: string, opts: { payloadFilter: string; jsonPath: string; jsonValue: string }): boolean {
  switch (mode) {
    case 'exact':
      return !opts.payloadFilter || payload.trim() === opts.payloadFilter;

    case 'json': {
      if (!opts.jsonPath) return true;

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return false;
      }

      const value = resolveJsonPath(parsed, opts.jsonPath);
      if (value === undefined) return false;
      // No expected value = match on presence of the path.
      if (!opts.jsonValue) return true;

      const scalar = scalarToString(value);
      return scalar !== undefined && scalar === opts.jsonValue;
    }

    case 'any':
    default:
      return true;
  }
}

function resolveJsonPath(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function scalarToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return undefined;
}
