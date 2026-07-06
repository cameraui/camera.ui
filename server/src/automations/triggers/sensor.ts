import { container } from 'tsyringe';

import { createEmptyContext } from '../context.js';

import type { Disposable } from '@camera.ui/sdk';
import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { InternalEventBus, InternalEventPayload, SensorPropertyChangedPayload } from '../../internal-bus.js';
import type { TriggerContext } from './types.js';

export function subscribeSensor(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const cameraId = triggerNode.data.cameraId as string;
  const sensorName = triggerNode.data.sensorName as string;
  const sensorPluginId = triggerNode.data.sensorPluginId as string;
  const watchProperties = (triggerNode.data.properties as string[]) ?? [];

  if (!cameraId || !sensorName) return;

  const camera = ctx.api.getCamera(cameraId);
  if (!camera) {
    ctx.logger.warn(`Automation "${flow.name}": Camera "${cameraId}" not found for sensor trigger`);
    return;
  }

  const sensor = camera.sensorController.getSensors().find((s) => s.name === sensorName && s.pluginId === sensorPluginId);
  if (!sensor) {
    ctx.logger.warn(`Automation "${flow.name}": Sensor "${sensorName}" not found on camera "${camera.name}"`);
    return;
  }

  const bus = container.resolve<InternalEventBus>('internalBus');
  const handler = (payload: InternalEventPayload) => {
    const p = payload as SensorPropertyChangedPayload;
    if (p.cameraId !== cameraId || p.sensorId !== sensor.id) return;
    if (watchProperties.length > 0 && !watchProperties.includes(p.property)) return;

    const context = createEmptyContext();
    context.sensor = {
      value: p.value,
      previousValue: p.previousValue,
      property: p.property,
      sensorType: p.sensorType,
      cameraId: p.cameraId,
    };

    ctx.executeFlow(flow, triggerNode, context);
  };

  bus.onEvent('sensor:property:changed', handler);

  const disposable: Disposable = {
    dispose: () => bus.offEvent('sensor:property:changed', handler),
  } as Disposable;

  ctx.addSubscription(flow._id, disposable);
  ctx.logger.trace(`Automation "${flow.name}": Subscribed to sensor "${sensorName}" on "${camera.name}" (properties: ${watchProperties.join(', ') || 'any'})`);
}
