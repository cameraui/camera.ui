import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { validateCron } from '../scheduler.js';
import { approvalSchema, isoTime, toolError } from './shared.js';

import type { AssistantManager } from '../manager.js';
import type { CoreTool, ToolContext } from './shared.js';

function manager(): AssistantManager {
  return container.resolve<AssistantManager>('assistantManager');
}

const listScheduledPrompts = toolDefinition({
  name: 'list_scheduled_prompts',
  lazy: true,
  description: 'List the scheduled prompts of the user, for example a daily summary at 20:00, with next run and last result.',
  inputSchema: zod.object({}),
}).server<ToolContext['context']>((_input, ctx) => {
  const scheduler = manager().scheduler;
  return scheduler.list(ctx.context.userId).map((schedule) => ({
    id: schedule._id,
    title: schedule.title,
    prompt: schedule.prompt,
    cron: schedule.cron,
    deliver: schedule.deliver,
    enabled: schedule.enabled,
    nextRun: isoTime(scheduler.nextRun(schedule) ?? undefined, ctx.context.timezone),
    lastRun: schedule.lastRun
      ? { at: isoTime(schedule.lastRun.at, ctx.context.timezone), status: schedule.lastRun.status, message: schedule.lastRun.message }
      : undefined,
  }));
});

const saveInput = zod.object({
  title: zod.string().min(1).max(80).describe('Short title, also the push title, e.g. "Daily summary"'),
  prompt: zod.string().min(1).max(2000).describe('The question to answer each time, as the user would ask it'),
  cron: zod.string().min(9).max(100).describe('Five field cron in the user time zone, e.g. "0 20 * * *" daily at 20:00, "0 8 * * 1-5" weekdays at 08:00'),
  deliver: zod.enum(['push', 'thread', 'both']).optional().describe('push (default), thread = saved conversation, or both'),
});

const saveScheduledPrompt = toolDefinition({
  name: 'save_scheduled_prompt',
  lazy: true,
  description:
    'Schedule a prompt the assistant answers regularly and delivers as push or saved conversation, for example a summary every evening. Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(saveInput),
}).server<ToolContext['context']>(async (args, ctx) => {
  const parsed = saveInput.safeParse(args);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);

  const problem = validateCron(parsed.data.cron, ctx.context.timezone);
  if (problem) return toolError(`The schedule "${parsed.data.cron}" is not valid: ${problem}`);

  try {
    const schedule = await manager().scheduler.create(ctx.context.userId, {
      title: parsed.data.title,
      prompt: parsed.data.prompt,
      cron: parsed.data.cron,
      timezone: ctx.context.timezone,
      language: ctx.context.language,
      deliver: parsed.data.deliver ?? 'push',
      enabled: true,
    });
    return { ok: true, id: schedule._id, title: schedule.title, nextRun: isoTime(manager().scheduler.nextRun(schedule) ?? undefined, ctx.context.timezone) };
  } catch (error: any) {
    return toolError(error.message);
  }
});

const deleteScheduledPrompt = toolDefinition({
  name: 'delete_scheduled_prompt',
  lazy: true,
  description: 'Delete a scheduled prompt. Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(zod.object({ id: zod.string().describe('Schedule id from list_scheduled_prompts') })),
}).server<ToolContext['context']>(async (args, ctx) => {
  const raw = (args as { id?: unknown }).id;
  const id = typeof raw === 'string' ? raw : '';
  const removed = await manager().scheduler.remove(ctx.context.userId, id);
  return removed ? { ok: true } : toolError(`No scheduled prompt with id "${id}".`);
});

export const scheduleTools: CoreTool[] = [listScheduledPrompts, saveScheduledPrompt, deleteScheduledPrompt];
