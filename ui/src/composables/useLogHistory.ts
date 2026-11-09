import type { ConsoleLinePosition, ConsoleScroll } from '@/components/CuiConsole/types.js';
import type { Ref } from 'vue';

export interface LogConsole {
  readonly atBottom: boolean;
  replaceLines(lines: string[], scroll: ConsoleScroll): Promise<void>;
  writeTerminal(data: string): void;
  topLine(): ConsoleLinePosition;
  highlightLines(lines: number[]): void;
  scrollToBottom(): void;
}

export interface LogHistoryOptions {
  view: () => LogConsole | null | undefined;
  search: Ref<string>;
}

interface LogChunk {
  lines: string[];
  offsets: number[];
  start: number;
  end: number;
  size: number;
  generation: number;
  targets?: number[];
  anchor?: number;
  missing?: boolean;
  firstAt?: number;
}

type LogReply = LogChunk | { error: 'not_found' | 'failed' };

interface LogQuery {
  before?: number;
  after?: number;
  around?: number;
  aroundStamp?: string;
}

interface WindowLine {
  text: string;
  offset?: number;
}

interface NewerLines {
  lines: WindowLine[];
  reply: LogChunk;
}

const MAX_LINES = 3000;
const REWRITE_SLACK = 500;
const MAX_PENDING = 2000;
const STAMP = /^\[(\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2})\]/;
const ANSI = /\x1b\[[0-9;]*m/g;

export function useLogHistory({ view, search }: LogHistoryOptions) {
  const channel = useSocket('/logs');

  const source = ref<string>();
  const loadingOlder = ref(false);
  const atBeginning = ref(false);
  const newLines = ref(0);
  const gone = ref<{ firstAt?: number }>();
  const notFound = ref(false);
  const failed = ref(false);

  let lines: WindowLine[] = [];
  let generation = 0;
  let liveEdge = true;
  let pending: string[] = [];
  let next: WindowLine | undefined;
  let jumpTo: number | undefined;
  let opens = 0;
  let busy = false;
  let held: string[] | undefined;
  let stopLive: (() => void) | undefined;

  function visible(text: string): boolean {
    const needle = search.value.trim().toLowerCase();
    return !needle || text.replace(ANSI, '').toLowerCase().includes(needle);
  }

  function stampOf(text: string): string | undefined {
    return STAMP.exec(text)?.[1];
  }

  function toWindow(chunk: LogChunk): WindowLine[] {
    return chunk.lines.map((text, index) => ({ text, offset: chunk.offsets[index] }));
  }

  async function request(query: LogQuery): Promise<LogChunk | undefined> {
    const reply = await channel.request<LogReply>('log:chunk', { source: source.value, ...query }).catch(() => undefined);
    if (!reply || 'error' in reply) {
      failed.value = true;
      return undefined;
    }
    return reply;
  }

  async function render(scroll: ConsoleScroll): Promise<void> {
    const console = view();
    if (!console) return;

    held = [];
    const searching = !!search.value.trim();
    await console.replaceLines(searching ? lines.map((line) => line.text).filter(visible) : lines.map((line) => line.text), searching ? { kind: 'bottom' } : scroll);

    const arrived = held;
    held = undefined;
    if (arrived.length) receive(arrived);
  }

  function append(incoming: string[]): void {
    lines.push(...incoming.map((text) => ({ text })));
    if (lines.length > MAX_LINES + REWRITE_SLACK) {
      trimTop();
      render({ kind: 'bottom' });
      return;
    }

    const shown = incoming.filter(visible);
    if (shown.length) view()?.writeTerminal(`${shown.join('\r\n')}\r\n`);
  }

  function receive(incoming: string[]): void {
    if (!liveEdge) {
      newLines.value += incoming.length;
      return;
    }

    if (view()?.atBottom && !pending.length) {
      append(incoming);
      return;
    }

    pending.push(...incoming);
    newLines.value += incoming.length;
    if (pending.length > MAX_PENDING) {
      // too much to keep, the way back to the end reloads it
      pending = [];
      liveEdge = false;
      next = undefined;
    }
  }

  function onLive(data: string): void {
    const incoming = data.split(/\r?\n/);
    if (incoming.at(-1) === '') incoming.pop();
    if (!incoming.length) return;

    if (held) {
      held.push(...incoming);
    } else {
      receive(incoming);
    }
  }

  function withoutRepeats(arrived: string[], chunk: LogChunk): string[] {
    // lines that came in live while the request ran may be in the reply as well
    const tail = new Set(chunk.lines.slice(-(arrived.length + 50)));
    return arrived.filter((text) => !tail.has(text));
  }

  function trimTop(): number {
    if (lines.length <= MAX_LINES) return 0;

    let cut = lines.length - MAX_LINES;
    // the top line keeps its time, so it can be found again in the file
    while (cut < lines.length - 1 && !stampOf(lines[cut].text)) cut++;
    lines.splice(0, cut);
    atBeginning.value = false;
    return cut;
  }

  function trimBottom(): void {
    if (lines.length <= MAX_LINES) return;

    let cut = MAX_LINES;
    while (cut > 1 && !stampOf(lines[cut].text)) cut--;
    next = lines.splice(cut)[0];
    liveEdge = false;
    pending = [];
  }

  function adopt(chunk: LogChunk, from?: number): void {
    // the file rotated since these offsets were read, the lines that match the new read get new ones
    generation = chunk.generation;
    let index = 0;
    while (from !== undefined && index < lines.length && chunk.lines[from + index] === lines[index].text) {
      lines[index].offset = chunk.offsets[from + index];
      index++;
    }
    for (; index < lines.length; index++) lines[index].offset = undefined;
    if (next) next.offset = undefined;
  }

  async function findOlder(): Promise<WindowLine[] | undefined> {
    const index = lines.findIndex((line) => stampOf(line.text));
    const stamp = index === -1 ? undefined : stampOf(lines[index].text);
    if (!stamp) return undefined;

    const chunk = await request({ aroundStamp: stamp });
    const match = chunk ? chunk.lines.indexOf(lines[index].text) : -1;
    if (!chunk || match < index) return undefined;

    adopt(chunk, match - index);
    atBeginning.value = chunk.start === 0;
    return toWindow(chunk).slice(0, match - index);
  }

  async function fetchOlder(): Promise<WindowLine[] | undefined> {
    const top = lines[0];
    if (top.offset !== undefined) {
      const chunk = await request({ before: top.offset });
      if (!chunk) return undefined;
      if (chunk.generation === generation) {
        atBeginning.value = chunk.start === 0;
        return toWindow(chunk);
      }
    }

    const older = await findOlder();
    if (older?.length || atBeginning.value || lines[0].offset === undefined) return older;
    return fetchOlder();
  }

  async function fetchNewer(): Promise<NewerLines | undefined> {
    if (next?.offset !== undefined) {
      const chunk = await request({ after: next.offset });
      if (!chunk) return undefined;
      if (chunk.generation === generation) return { lines: toWindow(chunk), reply: chunk };
    }

    const stamp = next && stampOf(next.text);
    if (!next || !stamp) return undefined;

    const chunk = await request({ aroundStamp: stamp });
    const match = chunk ? chunk.lines.indexOf(next.text) : -1;
    if (!chunk || match === -1) return undefined;

    adopt(chunk);
    return { lines: toWindow(chunk).slice(match), reply: chunk };
  }

  async function open(): Promise<void> {
    const id = ++opens;
    const around = jumpTo;
    jumpTo = undefined;

    lines = [];
    pending = [];
    next = undefined;
    liveEdge = true;
    newLines.value = 0;
    atBeginning.value = false;
    gone.value = undefined;
    notFound.value = false;
    failed.value = false;
    busy = false;

    stopLive?.();
    stopLive = channel.on<string>(`log:${source.value}`, onLive);

    held = [];
    const reply = await channel.request<LogReply>('log:open', { source: source.value, around }).catch(() => undefined);
    if (id !== opens) return;

    const arrived = held;
    held = undefined;
    if (!reply || 'error' in reply) {
      notFound.value = reply?.error === 'not_found';
      failed.value = !notFound.value;
      await render({ kind: 'bottom' });
      return;
    }

    generation = reply.generation;
    lines = toWindow(reply);
    atBeginning.value = reply.start === 0;
    liveEdge = reply.end >= reply.size;
    if (liveEdge) {
      lines.push(...withoutRepeats(arrived, reply).map((text) => ({ text })));
    } else {
      next = { text: '', offset: reply.end };
      newLines.value += arrived.length;
    }
    if (reply.missing) gone.value = { firstAt: reply.firstAt };

    const targets = reply.targets ?? [];
    const anchor = targets[0] ?? reply.anchor;
    await render(around === undefined || anchor === undefined ? { kind: 'bottom' } : { kind: 'target', line: anchor });
    if (targets.length && !search.value.trim()) view()?.highlightLines(targets);
  }

  function show(sourceId: string, at?: number): void {
    if (source.value && source.value !== sourceId) {
      channel.emit('logs:unsubscribe', { channel: `log:${source.value}` });
    }
    source.value = sourceId;
    jumpTo = at;
    if (channel.connected.value) open();
  }

  async function loadOlder(): Promise<void> {
    if (busy || atBeginning.value || search.value.trim() || !lines.length) return;

    const id = opens;
    busy = true;
    loadingOlder.value = true;
    try {
      const older = await fetchOlder();
      if (id !== opens) return;
      if (!older) {
        // nothing to line up with any more, start over at the end
        if (!atBeginning.value) await open();
        return;
      }
      if (!older.length) return;

      const console = view();
      const fits = console?.atBottom ?? false;
      const top = console?.topLine() ?? { line: 0, rowOffset: 0 };
      lines = [...older, ...lines];
      trimBottom();
      await render(fits && liveEdge ? { kind: 'bottom' } : { kind: 'keep', line: top.line + older.length, rowOffset: top.rowOffset });
    } finally {
      if (id === opens) {
        busy = false;
        loadingOlder.value = false;
      }
    }
  }

  async function loadNewer(): Promise<void> {
    if (busy || liveEdge || search.value.trim()) return;

    const id = opens;
    busy = true;
    held = [];
    try {
      const newer = await fetchNewer();
      if (id !== opens) return;
      if (!newer) {
        await open();
        return;
      }

      const arrived = held;
      held = undefined;
      const top = view()?.topLine() ?? { line: 0, rowOffset: 0 };
      lines.push(...newer.lines);

      if (newer.reply.end >= newer.reply.size) {
        liveEdge = true;
        next = undefined;
        lines.push(...withoutRepeats(arrived, newer.reply).map((text) => ({ text })));
        newLines.value = 0;
      } else {
        next = { text: '', offset: newer.reply.end };
        newLines.value += arrived.length;
      }

      const dropped = trimTop();
      await render({ kind: 'keep', line: Math.max(0, top.line - dropped), rowOffset: top.rowOffset });
    } finally {
      if (id === opens) {
        held = undefined;
        busy = false;
      }
    }
  }

  function reachedTop(): void {
    loadOlder();
  }

  function reachedBottom(): void {
    if (!liveEdge) {
      loadNewer();
      return;
    }

    newLines.value = 0;
    if (!pending.length) return;
    const waiting = pending;
    pending = [];
    append(waiting);
  }

  function jumpToEnd(): void {
    if (!liveEdge) {
      open();
      return;
    }

    newLines.value = 0;
    if (pending.length) {
      lines.push(...pending.map((text) => ({ text })));
      pending = [];
      trimTop();
      render({ kind: 'bottom' });
    } else {
      view()?.scrollToBottom();
    }
  }

  channel.on<string>('log:cleared', (cleared) => {
    if (cleared !== source.value) return;

    lines = [];
    pending = [];
    next = undefined;
    liveEdge = true;
    newLines.value = 0;
    gone.value = undefined;
    atBeginning.value = true;
    render({ kind: 'bottom' });
  });

  channel.onReady(() => {
    if (source.value) open();
  });

  watch(search, () => render({ kind: 'bottom' }));

  tryOnScopeDispose(() => {
    stopLive?.();
    if (source.value) channel.emit('logs:unsubscribe', { channel: `log:${source.value}` });
  });

  return { source, loadingOlder, atBeginning, newLines, gone, notFound, failed, show, reachedTop, reachedBottom, jumpToEnd };
}
