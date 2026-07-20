import { Cron } from 'croner';

import { createEmptyContext } from '../context.js';

import type { Disposable } from '@camera.ui/sdk';
import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { TriggerContext } from './types.js';

export function scheduleTimer(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const cron = triggerNode.data.cron as string;
  if (!cron) return;

  let job: Cron;
  try {
    job = new Cron(cron, { name: `automation-${flow._id}` }, () => {
      ctx.executeFlow(flow, triggerNode, createEmptyContext());
    });
  } catch (error) {
    ctx.logger.warn(`Automation "${flow.name}": invalid cron expression "${cron}": ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  ctx.addSubscription(flow._id, { dispose: () => job.stop() } as Disposable);
  ctx.logger.trace(`Automation "${flow.name}": Scheduled cron "${cron}", next run ${job.nextRun()?.toISOString() ?? 'never'}`);
}
