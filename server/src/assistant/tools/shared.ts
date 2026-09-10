import { convertSchemaToJsonSchema } from '@tanstack/ai';

import type { AssistantToolReference } from '@camera.ui/sdk';
import type { AnyServerTool, ContentPart, JSONSchema, ToolExecutionContext } from '@tanstack/ai';
import type * as zod from 'zod';
import type { AssistantRunContext } from '../types.js';

export const ASSISTANT_IMAGE_EVENT = 'assistant.image';
export const ASSISTANT_REFERENCE_EVENT = 'assistant.reference';
export const ASSISTANT_CARD_EVENT = 'assistant.card';
export const ASSISTANT_SETTING_EVENT = 'assistant.setting';

export const DOWNLOAD_PATH = /^\/api\/download\/[0-9a-f-]+$/i;

export type CoreTool = AnyServerTool;

export type ToolContext = ToolExecutionContext<AssistantRunContext>;

export interface CoreToolMetadata {
  adminOnly?: boolean;
  group?: string;
  chatOnly?: boolean;
}

export function approvalSchema(schema: zod.ZodType): JSONSchema {
  return convertSchemaToJsonSchema(schema)!;
}

export function toolError(message: string): { error: string } {
  return { error: message };
}

export interface ToolImage {
  data: string;
  mimeType: string;
  caption?: string;
}

export function withImages(text: string, images: ToolImage[], ctx: ToolContext): string | ContentPart[] {
  const usable = images.filter((img) => img.data.length > 0);
  if (usable.length === 0) return text;

  if (!ctx.context.sendImages) {
    for (const img of usable) {
      ctx.emitCustomEvent(ASSISTANT_IMAGE_EVENT, { toolCallId: ctx.toolCallId ?? null, data: img.data, mimeType: img.mimeType, caption: img.caption ?? null });
    }
    return `${text}\nThe image is shown to the user but not sent to you.`;
  }

  return [{ type: 'text', content: text }, ...usable.map((img): ContentPart => ({ type: 'image', source: { type: 'data', value: img.data, mimeType: img.mimeType } }))];
}

export function emitReferences(references: AssistantToolReference[] | undefined, ctx: ToolContext): void {
  for (const ref of (references ?? []).slice(0, 12)) {
    if (!ref || typeof ref.id !== 'string' || !['event', 'episode', 'camera', 'download'].includes(ref.kind)) continue;
    if (ref.kind === 'download' && !DOWNLOAD_PATH.test(ref.url ?? '')) continue;
    ctx.emitCustomEvent(ASSISTANT_REFERENCE_EVENT, {
      toolCallId: ctx.toolCallId ?? null,
      kind: ref.kind,
      id: ref.id,
      label: ref.label ?? null,
      cameraId: ref.cameraId ?? null,
      timestamp: ref.timestamp ?? null,
      url: ref.url ?? null,
    });
  }
}

export function isoTime(timestamp: number | undefined, timezone: string): string | undefined {
  if (!timestamp) return undefined;
  try {
    return new Date(timestamp).toLocaleString('sv-SE', { timeZone: timezone });
  } catch {
    return new Date(timestamp).toISOString();
  }
}
