import type { DBAssistantCard, DBAssistantCardItem } from '../api/database/types.js';

export const RECAP_TOOL = 'nvr__summarize_day';

const MAX_ITEMS = 12;
const LABEL_MAX = 80;
const NOTE_MAX = 160;

interface EpisodeBrief {
  id?: unknown;
  cams?: unknown;
  start?: unknown;
  title?: unknown;
  story?: unknown;
}

interface DaySummary {
  date?: unknown;
  episodes?: unknown;
}

export function recapCard(result: unknown, language: string, timezone: string): DBAssistantCard | undefined {
  const summary = parseResult(result);
  if (!summary) return undefined;

  const days: DaySummary[] = Array.isArray(summary.days) ? (summary.days as DaySummary[]) : [summary];
  const multiDay = days.length > 1;
  const episodes = days.flatMap((day) => (Array.isArray(day.episodes) ? (day.episodes as EpisodeBrief[]) : []));
  const items = episodes
    .filter((episode) => typeof episode.id === 'string' && typeof episode.start === 'string')
    .map((episode) => toItem(episode, multiDay, language, timezone))
    .filter((item) => item !== undefined);
  if (!items.length) return undefined;

  const from = typeof summary.from === 'string' ? summary.from : typeof days[0]?.date === 'string' ? days[0].date : undefined;
  const to = typeof summary.to === 'string' ? summary.to : from;
  return { kind: 'day_recap', title: rangeTitle(from, to, language, timezone), items: items.slice(-MAX_ITEMS) };
}

function toItem(episode: EpisodeBrief, multiDay: boolean, language: string, timezone: string): DBAssistantCardItem | undefined {
  const start = new Date(episode.start as string);
  if (Number.isNaN(start.getTime())) return undefined;

  const title = typeof episode.title === 'string' && episode.title.trim() ? episode.title : typeof episode.story === 'string' ? episode.story : '';
  if (!title.trim()) return undefined;
  const cams = Array.isArray(episode.cams) ? episode.cams.filter((cam): cam is string => typeof cam === 'string') : [];
  const time = new Intl.DateTimeFormat(language, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    ...(multiDay ? { weekday: 'short' as const } : {}),
  }).format(start);

  return {
    label: clip(title, LABEL_MAX),
    value: time,
    ...(cams.length ? { note: clip(cams.join(', '), NOTE_MAX) } : {}),
    episodeId: episode.id as string,
  };
}

function rangeTitle(from: string | undefined, to: string | undefined, language: string, timezone: string): string {
  const first = from ? new Date(`${from}T12:00:00Z`) : new Date();
  const last = to ? new Date(`${to}T12:00:00Z`) : first;
  const format = new Intl.DateTimeFormat(language, { timeZone: timezone, weekday: from === to ? 'long' : undefined, day: 'numeric', month: 'long' });
  return from === to ? format.format(first) : format.formatRange(first, last);
}

function parseResult(result: unknown): Record<string, unknown> | undefined {
  let value = result;
  for (let depth = 0; depth < 2 && typeof value === 'string'; depth++) {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
