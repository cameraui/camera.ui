import type { CompactionStrategy } from '@tanstack/ai-compaction';

const CUT_NOTE = ' […] cut here, ask again for a narrower range to see the rest';

export function trimToolResults(options: { maxChars: number }): CompactionStrategy {
  return (messages) => {
    let changed = false;
    const next = messages.map((message) => {
      if (message.role !== 'tool' || typeof message.content !== 'string') return message;
      if (message.content.length <= options.maxChars || message.content.endsWith(CUT_NOTE)) return message;

      changed = true;
      return { ...message, content: message.content.slice(0, options.maxChars) + CUT_NOTE };
    });
    return changed ? next : null;
  };
}
