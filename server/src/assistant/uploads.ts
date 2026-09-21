import { createHash } from 'node:crypto';

import type { ModelMessage, UIMessage } from '@tanstack/ai';
import type { AssistantUpload, AssistantUploadKind } from './types.js';

export const ATTACHMENT_PREFIX = 'attachment:';

const LIMITS: Record<AssistantUploadKind, number> = { image: 12 * 1024 * 1024, audio: 25 * 1024 * 1024, video: 60 * 1024 * 1024 };
const MAX_UPLOADS = 8;
const KINDS = new Set<string>(['image', 'audio', 'video']);
const PICTURES_LEAD = 'The pictures of the tool results above. Carry on with what was asked.';
const PICTURE_LEFT_OUT = '[picture left out, the context window holds only the newest]';
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

export function messagesForModel(messages: ModelMessage[], sendImages: boolean, maxPictures = Infinity): ModelMessage[] {
  const out: ModelMessage[] = [];
  let pictures: DataPart[] = [];
  for (const message of answerAfterResults(messages)) {
    if (pictures.length && message.role !== 'tool') {
      out.push(picturesMessage(pictures));
      pictures = [];
    }
    if (message.role === 'tool' && Array.isArray(message.content)) {
      const parts = message.content as DataPart[];
      const images = parts.filter((part) => part.type === 'image');
      if (images.length) {
        out.push({ ...message, content: parts.filter((part) => part.type !== 'image') } as ModelMessage);
        pictures.push(...images);
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
  if (pictures.length) out.push(picturesMessage(pictures));
  return Number.isFinite(maxPictures) ? newestPictures(out, maxPictures) : out;
}

export function isPicturesMessage(message: ModelMessage): boolean {
  const first = Array.isArray(message.content) ? (message.content[0] as { content?: unknown }) : undefined;
  return first?.content === PICTURES_LEAD;
}

function picturesMessage(pictures: DataPart[]): ModelMessage {
  return { role: 'user', content: [{ type: 'text', content: PICTURES_LEAD }, ...pictures] } as ModelMessage;
}

function newestPictures(messages: ModelMessage[], limit: number): ModelMessage[] {
  let kept = 0;
  const out = [...messages];
  for (let index = out.length - 1; index >= 0; index--) {
    const message = out[index];
    if (!Array.isArray(message.content)) continue;
    const parts = (message.content as DataPart[]).map((part) => (part.type !== 'image' || ++kept <= limit ? part : { type: 'text', content: PICTURE_LEFT_OUT }));
    if (kept > limit) out[index] = { ...message, content: parts } as ModelMessage;
  }
  return out;
}

function answerAfterResults(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  let answer: ModelMessage | undefined;

  for (const message of messages) {
    if (answer && message.role !== 'tool') {
      out.push(answer);
      answer = undefined;
    }
    const { toolCalls, ...rest } = message as ModelMessage & { toolCalls?: unknown[] };
    if (message.role === 'assistant' && toolCalls?.length && message.content) {
      answer = { ...rest, id: rest.id ? `${rest.id}-answer` : undefined };
      out.push({ ...message, content: null });
      continue;
    }
    out.push(message);
  }
  if (answer) out.push(answer);

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
