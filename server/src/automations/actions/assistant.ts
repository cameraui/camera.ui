import { container } from 'tsyringe';

import { UsersService } from '../../api/services/users.service.js';

import type { AssistantManager } from '../../assistant/manager.js';
import type { ActionContext } from './types.js';

const SILENT = 'NO_REPLY';
const SILENT_RULE =
  'When the answer would tell the user nothing worth a message (nothing happened, nothing to report, no change), ' + `reply with exactly ${SILENT} and nothing else.`;

export async function actionAssistant(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const prompt = ctx.resolve((data.prompt as string) ?? '').trim();
  const username = ((data.user as string) ?? '').trim();
  const user = username ? new UsersService().findByName(username) : undefined;
  if (!prompt || !user) {
    ctx.logger.warn(`[automation:${ctx.flowName}] action-assistant skipped, ${prompt ? 'user not found' : 'prompt is empty'}`);
    setResult(ctx, '', false, 'false');
    return;
  }
  const deliver = typeof data.deliver === 'string' ? data.deliver : 'push';
  const title = ctx.resolve((data.title as string) ?? '').trim() || ctx.flowName;
  const image = imageOf(ctx.resolve((data.image as string) ?? ''));

  const manager = container.resolve<AssistantManager>('assistantManager');
  try {
    const result = await manager.runPrompt(user, prompt, { image, instructions: SILENT_RULE });
    const silent = result.text.trim().toUpperCase() === SILENT || !result.text.trim();
    setResult(ctx, silent ? '' : result.text, !silent, 'true');
    if (silent || deliver === 'none') return;
    await manager.deliver(user, {
      title,
      prompt,
      text: result.text,
      image: result.image ?? image,
      attachments: result.attachments,
      push: deliver === 'push' || deliver === 'both',
      thread: deliver === 'thread' || deliver === 'both',
      tag: `automation:${ctx.flowId}`,
    });
  } catch (err) {
    ctx.logger.warn(`[automation:${ctx.flowName}] action-assistant failed: ${(err as Error).message}`);
    setResult(ctx, '', false, 'false');
  }
}

function setResult(ctx: ActionContext, answer: string, replied: boolean, success: string): void {
  ctx.variables.set('assistant.answer', answer);
  ctx.variables.set('assistant.replied', replied ? 'true' : 'false');
  ctx.variables.set('previous.result', replied ? 'assistant_replied' : 'assistant_silent');
  ctx.variables.set('previous.success', success);
}

function imageOf(raw: string): { data: string; mimeType: string } | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('http')) return undefined;
  const comma = trimmed.startsWith('data:') ? trimmed.indexOf(',') : -1;
  const data = comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  const mimeType = trimmed.startsWith('data:') ? trimmed.slice(5, trimmed.indexOf(';')) || 'image/jpeg' : 'image/jpeg';
  return data.length > 100 ? { data, mimeType } : undefined;
}
