import { uuidv4 } from '@camera.ui/common/utils';
import { Severity } from '@camera.ui/sdk';
import { stripVTControlCharacters } from 'node:util';

import type { NotificationLogMessage } from '../api/database/types.js';

export interface PluginLogBurst {
  id: string;
  pluginId: string;
  cameraId?: string;
  startedAt: number;
  lastAt: number;
  count: number;
  severity: Severity;
  created: boolean;
  groups: Map<string, NotificationLogMessage>;
}

const BURST_QUIET = 10 * 60_000;
const UPDATE_DELAY = 5_000;
const MAX_GROUPS = 20;
const MAX_TEXT = 300;

export class PluginLogBursts {
  private bursts = new Map<string, PluginLogBurst>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private flush: (burst: PluginLogBurst, create: boolean) => Promise<boolean>) {}

  public note(pluginId: string, cameraId: string | undefined, severity: Severity, message: string, at: number): void {
    const text = maskSecrets(firstLine(message)).slice(0, MAX_TEXT);
    if (!text) return;

    const key = cameraId ? `${pluginId}:${cameraId}` : pluginId;
    const burst = this.current(key, pluginId, cameraId, severity, at);

    burst.count++;
    burst.lastAt = Math.max(burst.lastAt, at);
    if (severity === Severity.Error) burst.severity = Severity.Error;

    const group = normalize(text);
    const known = burst.groups.get(group);
    if (known) {
      known.text = text;
      known.count++;
      known.lastAt = at;
    } else if (burst.groups.size < MAX_GROUPS) {
      burst.groups.set(group, { text, count: 1, lastAt: at });
    }

    if (!this.timers.has(key)) {
      this.timers.set(
        key,
        setTimeout(() => this.run(key, burst), burst.created ? UPDATE_DELAY : 0),
      );
    }
  }

  public end(pluginId: string): void {
    for (const [key, burst] of this.bursts) {
      if (burst.pluginId !== pluginId) continue;

      this.bursts.delete(key);
      const timer = this.timers.get(key);
      if (!timer) continue;
      // the pending update would hold the timer slot the next entry needs
      clearTimeout(timer);
      this.run(key, burst);
    }
  }

  public destroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private current(key: string, pluginId: string, cameraId: string | undefined, severity: Severity, at: number): PluginLogBurst {
    const burst = this.bursts.get(key);
    if (burst && at - burst.lastAt < BURST_QUIET) return burst;

    const started: PluginLogBurst = { id: uuidv4(), pluginId, cameraId, startedAt: at, lastAt: at, count: 0, severity, created: false, groups: new Map() };
    this.bursts.set(key, started);
    return started;
  }

  private async run(key: string, burst: PluginLogBurst): Promise<void> {
    this.timers.delete(key);
    const create = !burst.created;
    burst.created = true;

    const kept = await this.flush(burst, create).catch(() => false);
    if (!kept && this.bursts.get(key) === burst) this.bursts.delete(key);
  }
}

export function burstMessages(burst: PluginLogBurst): NotificationLogMessage[] {
  return [...burst.groups.values()].map((message) => ({ ...message })).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
}

export function maskSecrets(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
    .replace(/\b([\w-]*(?:token|passw(?:or)?d|pwd|secret|api[_-]?key|apikey|auth|sig(?:nature)?)|pass|key)=[^\s&"',;]+/gi, '$1=***')
    .replace(/("(?:[\w-]*(?:token|passw(?:or)?d|pwd|secret|api[_-]?key|apikey)|pass|auth|key)"\s*:\s*")[^"]*"/gi, '$1***"')
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]+/g, '$1 ***');
}

export function normalize(text: string): string {
  return text
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<ip>')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, '<hex>')
    .replace(/\d+(?:\.\d+)?/g, '#');
}

function firstLine(message: string): string {
  return stripVTControlCharacters(message).trim().split('\n', 1)[0].trim();
}
