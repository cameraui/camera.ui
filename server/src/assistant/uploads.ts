import { createHash } from 'node:crypto';

import type { ModelMessage, UIMessage } from '@tanstack/ai';
import type { AssistantUpload, AssistantUploadKind } from './types.js';

export const ATTACHMENT_PREFIX = 'attachment:';

const LIMITS: Record<AssistantUploadKind, number> = { image: 12 * 1024 * 1024, audio: 25 * 1024 * 1024, video: 60 * 1024 * 1024 };
const MAX_UPLOADS = 8;
const KINDS = new Set<string>(['image', 'audio', 'video']);
const DEFAULT_MIME: Record<AssistantUploadKind, string> = { image: 'image/jpeg', audio: 'audio/wav', video: 'video/mp4' };

export interface DataPart {
  type: string;
  source?: { type?: string; value?: string; mimeType?: string };
}

export function partsOf(message: unknown): DataPart[] {
  const typed = message as { parts?: unknown; content?: unknown };
  if (Array.isArray(typed.parts)) return typed.parts as DataPart[];
  return Array.isArray(typed.content) ? (typed.content as DataPart[]) : [];
}

export function extractUploads(messages: (UIMessage | ModelMessage)[]): AssistantUpload[] {
  const uploads: AssistantUpload[] = [];
  messages.forEach((message, index) => {
    if (message.role !== 'user') return;
    for (const part of partsOf(message)) {
      if (!isDataUpload(part) || uploads.length >= MAX_UPLOADS) continue;
      const kind = part.type as AssistantUploadKind;
      const value = part.source!.value!;
      const data = Buffer.from(value, 'base64');
      uploads.push({
        id: `upload-${uploads.length + 1}`,
        key: attachmentKey(value),
        kind,
        mimeType: part.source!.mimeType ?? DEFAULT_MIME[kind],
        size: data.byteLength,
        data,
        messageIndex: index,
        tooLarge: data.byteLength > LIMITS[kind],
      });
    }
  });
  return uploads;
}

export function attachmentKey(base64: string): string {
  return createHash('sha256').update(base64).digest('hex').slice(0, 24);
}

export function isDataUpload(part: DataPart): boolean {
  return KINDS.has(part.type) && part.source?.type === 'data' && typeof part.source.value === 'string' && part.source.value.length > 0;
}

export function isAttachmentMarker(part: DataPart): boolean {
  return KINDS.has(part.type) && part.source?.type === 'url' && typeof part.source.value === 'string' && part.source.value.startsWith(ATTACHMENT_PREFIX);
}

export function markerFor(part: DataPart): DataPart {
  return { type: part.type, source: { type: 'url', value: `${ATTACHMENT_PREFIX}${attachmentKey(part.source!.value!)}` } };
}

export function messagesForModel(messages: ModelMessage[], sendImages: boolean): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === 'tool' && Array.isArray(message.content)) {
      const parts = message.content as DataPart[];
      const images = parts.filter((part) => part.type === 'image');
      if (images.length) {
        out.push({ ...message, content: parts.filter((part) => part.type !== 'image') } as ModelMessage);
        out.push({ role: 'user', content: images } as ModelMessage);
        continue;
      }
    }
    if (message.role !== 'user' || !Array.isArray(message.content)) {
      out.push(message);
      continue;
    }
    const content = (message.content as DataPart[]).filter((part) => !isAttachmentMarker(part) && (!isDataUpload(part) || (part.type === 'image' && sendImages)));
    if (content.length === message.content.length) {
      out.push(message);
      continue;
    }
    out.push({ ...message, content: content.length ? content : [{ type: 'text', content: '[attachment]' }] } as ModelMessage);
  }
  return out;
}

export function describeUploads(uploads: AssistantUpload[], sendImages: boolean): string {
  if (!uploads.length) return '';
  const lines = uploads.map((u) => `- ${u.id}: ${u.kind}, ${u.mimeType}, ${Math.max(1, Math.round(u.size / 1024))} KB${u.tooLarge ? ', rejected as too large' : ''}`);
  return [
    'Files the user attached in this conversation:',
    ...lines,
    'Run a plugin detector on them with analyze_image, analyze_audio or analyze_video and the upload id.',
    sendImages
      ? 'Attached pictures are visible to you as well, describe what you see when asked.'
      : 'You do not see attached pictures or hear audio, only the plugins do.',
  ].join('\n');
}
