import { pathExists } from 'fs-extra/esm';
import { dump, load } from 'js-yaml';
import { readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_CONFIG, DEFAULT_GO2RTC_CONFIG } from './constants.js';
import { DESKTOP_PORT_OFFSET, ELECTRON_PORT_OFFSET } from './defaults.js';

import type { RestorePlatformChange } from '../../api/types/index.js';
import type { Go2RtcConfig, IConfig } from './types.js';

type Section = Record<string, unknown>;

const HA_INGRESS_PORT = 3080;
const SECRET_KEYS = new Set(['worker.pairingCode']);
const ANY_HOST = new Set(['', '0.0.0.0', '::', 'localhost', '127.0.0.1', '::1']);
const GO2RTC_LISTENS = [
  ['api', 'tls_listen'],
  ['rtsp', 'listen'],
  ['srtp', 'listen'],
  ['rtmp', 'listen'],
  ['webrtc', 'listen'],
] as const;

export async function alignStagedPlatformValues(storagePath: string, environment: string[] | undefined): Promise<RestorePlatformChange[]> {
  const configFile = join(storagePath, 'camera.ui.yaml');
  const go2rtcFile = join(storagePath, 'go2rtc.yaml');
  const config = await readYaml<Partial<IConfig>>(configFile);
  const go2rtc = await readYaml<Partial<Go2RtcConfig>>(go2rtcFile);

  const configChanges = config ? alignConfig(config, environment) : [];
  const go2rtcChanges = go2rtc ? alignGo2Rtc(go2rtc) : [];

  if (configChanges.length) await writeFile(configFile, dump(config, { lineWidth: -1, noRefs: true }));
  if (go2rtcChanges.length) await writeFile(go2rtcFile, dump(go2rtc, { lineWidth: -1, noRefs: true }));

  return [...configChanges, ...go2rtcChanges];
}

export function alignConfig(config: Partial<IConfig>, environment: string[] | undefined): RestorePlatformChange[] {
  const values = config as Section;
  const changes: RestorePlatformChange[] = [];
  const fromEnvironment = new Set(environment ?? []);

  if (!environment && values.insecurePort === HA_INGRESS_PORT) fromEnvironment.add('insecurePort');

  for (const key of fromEnvironment) {
    const value = readKey(values, key);
    if (value === undefined) continue;

    const fallback = readKey(DEFAULT_CONFIG as unknown as Section, key);
    const to = fallback === undefined ? '' : describe(fallback);
    dropKey(values, key);
    if (to !== describe(value)) {
      changes.push({ setting: key, from: SECRET_KEYS.has(key) ? '•••' : describe(value), to: to || undefined });
    }
  }

  for (const key of ['port', 'workers.port']) {
    const value = readKey(values, key);
    const target = readKey(DEFAULT_CONFIG as unknown as Section, key) as number;
    if (typeof value === 'number' && value !== target && isPlatformDefault(value, target)) {
      writeKey(values, key, target);
      changes.push({ setting: key, from: String(value), to: String(target) });
    }
  }

  if (typeof config.host === 'string' && !isHostAddress(config.host)) {
    changes.push({ setting: 'host', from: config.host, to: DEFAULT_CONFIG.host });
    config.host = DEFAULT_CONFIG.host;
  }

  const workersAddress = config.workers?.address;
  if (config.workers && typeof workersAddress === 'string' && !isHostAddress(workersAddress)) {
    changes.push({ setting: 'workers.address', from: workersAddress });
    config.workers.address = '';
  }

  return changes;
}

export function alignGo2Rtc(go2rtc: Partial<Go2RtcConfig>): RestorePlatformChange[] {
  const values = go2rtc as Record<string, Section | undefined>;
  const changes: RestorePlatformChange[] = [];

  for (const [section, key] of GO2RTC_LISTENS) {
    const value = values[section]?.[key];
    const target = (DEFAULT_GO2RTC_CONFIG[section] as unknown as Section)[key] as string;
    if (typeof value !== 'string' || listenPort(value) === listenPort(target) || !isPlatformDefault(listenPort(value), listenPort(target))) continue;

    const aligned = `${value.slice(0, value.lastIndexOf(':') + 1)}${listenPort(target)}`;
    values[section]![key] = aligned;
    changes.push({ setting: `go2rtc.${section}.${key}`, from: value, to: aligned });
  }

  const candidates = go2rtc.webrtc?.candidates;
  const target = listenPort(DEFAULT_GO2RTC_CONFIG.webrtc.listen);
  if (go2rtc.webrtc && Array.isArray(candidates)) {
    const aligned = candidates.map((candidate) => {
      const port = /^stun:(\d+)$/.exec(candidate)?.[1];
      return port && Number(port) !== target && isPlatformDefault(Number(port), target) ? `stun:${target}` : candidate;
    });
    if (aligned.some((candidate, index) => candidate !== candidates[index])) {
      go2rtc.webrtc.candidates = aligned;
      changes.push({ setting: 'go2rtc.webrtc.candidates', from: candidates.join(', '), to: aligned.join(', ') });
    }
  }

  return changes;
}

export function isHostAddress(host: string): boolean {
  if (ANY_HOST.has(host) || !isIP(host)) return true;
  return Object.values(networkInterfaces()).some((list) => list?.some((entry) => entry.address === host));
}

async function readYaml<T>(file: string): Promise<T | undefined> {
  if (!(await pathExists(file))) return undefined;
  const content = await readFile(file, 'utf-8');
  const parsed = content.trim() ? load(content) : undefined;
  return parsed && typeof parsed === 'object' ? (parsed as T) : undefined;
}

function isPlatformDefault(value: number, target: number): boolean {
  const base = target - ELECTRON_PORT_OFFSET;
  return value === base || value === base + DESKTOP_PORT_OFFSET;
}

export function listenPort(listen: string): number {
  return Number(listen.slice(listen.lastIndexOf(':') + 1));
}

export function readKey(values: Section, key: string): unknown {
  const [section, name] = key.split('.');
  return name ? (values[section] as Section | undefined)?.[name] : values[section];
}

export function writeKey(values: Section, key: string, value: unknown): void {
  const [section, name] = key.split('.');
  if (name) ((values[section] ??= {}) as Section)[name] = value;
  else values[section] = value;
}

export function dropKey(values: Section, key: string): void {
  const [section, name] = key.split('.');
  if (!name) delete values[section];
  else if (values[section] && typeof values[section] === 'object') delete (values[section] as Section)[name];
}

function describe(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}
