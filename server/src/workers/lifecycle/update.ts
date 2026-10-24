import { gt, lt, valid } from 'semver';

import { MIN_WORKER_PROTOCOL } from '../types.js';
import { stay } from './reducer.js';
import { DESKTOP_UPDATE_RESTART_MS, LEGACY_UPDATE_IDLE_MS, UPDATE_IDLE_MS, UPDATE_RESTART_WINDOW_MS, UPDATE_TOTAL_MS } from './timing.js';

import type { VersionStanding, WorkerUpdateState } from '../types.js';
import type { Step } from './reducer.js';

export interface WorkerUpdate {
  target: string;
  phase: 'requested' | 'installing' | 'staged' | 'restarting';
  startedAt: number;
  seenAt: number;
  restartAt?: number;
  fromBoot?: string;
  fromPid?: number;
  fromVersion?: string;
  priorError?: string;
  desktop?: { fromApp?: string };
  legacy?: boolean;
}

export interface WorkerUpdateReport {
  bootId?: string;
  pid?: number;
  version?: string;
  protocol?: number;
  appVersion?: string;
  update?: WorkerUpdateState;
}

export type WorkerUpdateEvent =
  ({ type: 'report'; now: number } & WorkerUpdateReport) | { type: 'restarting'; now: number } | { type: 'tick'; now: number } | { type: 'resumed'; now: number };

export type WorkerUpdateEffect = { type: 'changed' } | { type: 'done'; version?: string } | { type: 'failed'; reason: string };

export interface WorkerProtocolRange {
  level: number;
  min: number;
}

export function startUpdate(target: string, now: number, from: WorkerUpdateReport, desktop: boolean, legacy = false): WorkerUpdate {
  return {
    target,
    phase: 'requested',
    startedAt: now,
    seenAt: now,
    fromBoot: from.bootId,
    fromPid: from.pid,
    fromVersion: from.version,
    priorError: from.update?.error,
    desktop: desktop ? { fromApp: from.appVersion } : undefined,
    legacy: legacy || undefined,
  };
}

export function reduceUpdate(update: WorkerUpdate, event: WorkerUpdateEvent): Step<WorkerUpdate | undefined, WorkerUpdateEffect> {
  switch (event.type) {
    case 'report':
      return report(update, event);
    case 'restarting':
      if (update.phase === 'restarting') return stay(update);
      return { state: { ...update, phase: 'restarting', restartAt: event.now }, effects: [{ type: 'changed' }] };
    case 'tick':
      return tick(update, event.now);
    case 'resumed':
      return stay({ ...update, startedAt: event.now, seenAt: event.now, restartAt: update.restartAt !== undefined ? event.now : undefined });
  }
}

export function versionStanding(version: string | undefined, target: string): VersionStanding {
  if (!version) return 'unknown';
  if (version === target) return 'same';
  if (!valid(version) || !valid(target)) return 'unknown';
  if (lt(version, target)) return 'behind';
  return gt(version, target) ? 'ahead' : 'same';
}

export function workerBehind(worker: { versionStanding?: VersionStanding; versionMismatch?: boolean }): boolean {
  return worker.versionStanding === 'behind' || (worker.versionStanding === 'unknown' && worker.versionMismatch === true);
}

export function connectsAfter(worker: { version?: string; protocol?: number }, target: string, range: WorkerProtocolRange | undefined): boolean {
  if (worker.version === target) return true;
  return range !== undefined && worker.protocol !== undefined && worker.protocol >= range.min;
}

export function describeUpdatePhase(update: WorkerUpdate): NonNullable<WorkerUpdateState['phase']> {
  return update.phase === 'requested' ? 'installing' : update.phase;
}

function report(update: WorkerUpdate, event: WorkerUpdateReport & { now: number }): Step<WorkerUpdate | undefined, WorkerUpdateEffect> {
  if (isNewBoot(update, event)) {
    return { state: undefined, effects: [judge(update, event)] };
  }

  const state = event.update;
  if (state?.phase === 'failed' && state.target === update.target) {
    return failed(state.error ?? 'the update failed');
  }
  if (state && !state.updating && state.error && state.error !== update.priorError) {
    return failed(state.error);
  }

  const phase = state?.phase === 'staged' ? 'staged' : state?.updating && update.phase === 'requested' ? 'installing' : update.phase;
  const next = { ...update, seenAt: event.now };
  if (phase === update.phase || update.phase === 'restarting') {
    return stay(next);
  }
  return { state: { ...next, phase }, effects: [{ type: 'changed' }] };
}

function isNewBoot(update: WorkerUpdate, event: WorkerUpdateReport): boolean {
  if (event.bootId && update.fromBoot) return event.bootId !== update.fromBoot;
  if (event.pid !== undefined && update.fromPid !== undefined && event.pid !== update.fromPid) return true;
  // a container can give the new server the same pid, the version shows the swap
  return !update.fromBoot && event.version === update.target && event.version !== update.fromVersion;
}

function judge(update: WorkerUpdate, event: WorkerUpdateReport): WorkerUpdateEffect {
  if (update.desktop) {
    if ((event.protocol ?? 0) < MIN_WORKER_PROTOCOL) {
      return { type: 'failed', reason: `the desktop app came back with a worker protocol this server does not support (${event.version ?? 'unknown version'})` };
    }
    if (update.desktop.fromApp && event.appVersion === update.desktop.fromApp) {
      return { type: 'failed', reason: `the desktop app is still on ${event.appVersion} after its restart` };
    }
    return { type: 'done', version: event.version };
  }

  if (event.version === update.target) {
    return { type: 'done', version: event.version };
  }
  const last = event.update?.lastResult;
  const why = last?.target === update.target && last.result !== 'applied' ? `, ${describeResult(last)}` : '';
  return { type: 'failed', reason: `still on ${event.version ?? 'an unknown version'} after its restart${why}` };
}

function describeResult(last: NonNullable<WorkerUpdateState['lastResult']>): string {
  const what = last.result === 'rolled-back' ? 'rolled back' : 'the new version could not be put in place';
  return last.reason ? `${what}: ${last.reason}` : what;
}

function tick(update: WorkerUpdate, now: number): Step<WorkerUpdate | undefined, WorkerUpdateEffect> {
  if (update.phase === 'restarting') {
    const window = update.desktop ? DESKTOP_UPDATE_RESTART_MS : UPDATE_RESTART_WINDOW_MS;
    return now - (update.restartAt ?? now) >= window ? failed(`did not come back within ${minutes(window)} after its restart`) : stay(update);
  }
  if (update.legacy && now - update.seenAt >= LEGACY_UPDATE_IDLE_MS) {
    return failed(`did not restart within ${minutes(LEGACY_UPDATE_IDLE_MS)}, the log on the worker shows why`);
  }
  if (now - update.seenAt >= UPDATE_IDLE_MS) {
    return failed(`no word from the worker for ${minutes(UPDATE_IDLE_MS)}`);
  }
  if (now - update.startedAt >= UPDATE_TOTAL_MS) {
    return failed(`not finished after ${minutes(UPDATE_TOTAL_MS)}`);
  }
  return stay(update);
}

function failed(reason: string): Step<WorkerUpdate | undefined, WorkerUpdateEffect> {
  return { state: undefined, effects: [{ type: 'failed', reason }] };
}

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}
