import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { AssistantSettingKey, DBAssistantAttachmentNotice, DBAssistantCard } from '@shared/types';
import type { ContentPart, ToolCallPart, ToolResultPart } from '@tanstack/ai';

export interface CuiAssistantToolCallProps {
  part: ToolCallPart;
  result?: ToolResultPart;
  extraImages?: ToolResultImage[];
  references?: AssistantReference[];
  cards?: DBAssistantCard[];
  settings?: AssistantSettingKey[];
  notices?: DBAssistantAttachmentNotice[];
  modelId?: string | null;
  inlineAttachments?: boolean;
}

export interface ToolResultImage {
  src: string;
  alt: string;
}

export function toolDisplayName(name: string): string {
  const bare = name.includes('__') ? name.slice(name.indexOf('__') + 2) : name;
  return bare.replace(/_/g, ' ');
}

export function resultContentParts(result: ToolResultPart | undefined): ContentPart[] | null {
  const content = result?.content;
  if (Array.isArray(content)) return content;
  if (typeof content !== 'string' || !content.trimStart().startsWith('[')) return null;
  const parsed = safeParseJson(content);
  return Array.isArray(parsed) && parsed.every((part) => part && typeof part === 'object' && 'type' in part) ? (parsed as ContentPart[]) : null;
}

export function resultImages(parts: ContentPart[] | null, alt: string): ToolResultImage[] {
  return (parts ?? [])
    .filter((part) => part.type === 'image' && part.source.type === 'data')
    .map((part) => {
      const source = part.type === 'image' ? part.source : undefined;
      const mime = source && 'mimeType' in source ? (source.mimeType ?? 'image/jpeg') : 'image/jpeg';
      return { src: `data:${mime};base64,${source?.value ?? ''}`, alt };
    });
}

export function safeParseJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
