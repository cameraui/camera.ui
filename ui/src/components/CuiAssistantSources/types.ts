import type { ToolCallPart } from '@tanstack/ai';

export interface AssistantSource {
  url: string;
  title?: string;
}

export interface CuiAssistantSourcesProps {
  sources: AssistantSource[];
}

export function searchSources(part: ToolCallPart): AssistantSource[] {
  const metadata = part.metadata as { providerExecuted?: boolean; sources?: unknown; anthropic?: { result?: unknown } } | undefined;
  if (metadata?.providerExecuted !== true) return [];
  const raw = Array.isArray(metadata.sources) ? metadata.sources : Array.isArray(metadata.anthropic?.result) ? metadata.anthropic.result : [];
  return raw.flatMap((entry: { url?: unknown; title?: unknown }) =>
    typeof entry?.url === 'string' && /^https?:\/\//.test(entry.url)
      ? [{ url: entry.url, title: typeof entry.title === 'string' && entry.title ? entry.title : undefined }]
      : [],
  );
}

export function sourceLabel(source: AssistantSource): string {
  if (source.title) return source.title;
  try {
    return new URL(source.url).hostname;
  } catch {
    return source.url;
  }
}
