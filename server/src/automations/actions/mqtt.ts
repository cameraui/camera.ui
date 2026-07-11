import { container } from 'tsyringe';

import type { MqttManager } from '../../mqtt/manager.js';
import type { ActionContext } from './types.js';

export async function actionMqtt(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const topic = ctx.resolve((data.topic as string) ?? '').trim();
  if (!topic) throw new Error('MQTT topic is required');
  if (topic.includes('+') || topic.includes('#')) throw new Error('MQTT topic must not contain wildcards');

  const mqttManager = container.resolve<MqttManager>('mqttManager');
  if (!mqttManager.connected) throw new Error('MQTT is not connected');

  const payload = ctx.resolve((data.payload as string) ?? '');
  mqttManager.publish(topic, payload, { retain: !!data.retain });
}
