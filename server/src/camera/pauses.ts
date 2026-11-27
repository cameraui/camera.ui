import { CamerasService } from '../api/services/cameras.service.js';

import type { Logger } from '@camera.ui/common/logger';
import type { BaseCamera, Camera } from '@camera.ui/sdk';
import type { DBCamera } from '../api/database/types.js';
import type { DeepPartial } from '../types.js';

type PauseKind = 'snooze' | 'recording' | 'privacy';

interface Pause {
  on: boolean;
  since?: number;
  until?: number;
}

const MAX_DELAY_MS = 2_147_483_647;

const RESUME: Record<PauseKind, DeepPartial<DBCamera>> = {
  snooze: { detectionSettings: { snooze: false } },
  recording: { recordingSettings: { paused: false } },
  privacy: { privacy: { enabled: false } },
};

export class PauseTimers {
  private timers = new Map<PauseKind, NodeJS.Timeout>();
  private ends = new Map<PauseKind, number | undefined>();

  constructor(
    private cameraName: () => string,
    private logger: Logger,
  ) {}

  public sync(camera: Camera): void {
    this.arm('snooze', camera.detectionSettings?.snooze ? camera.detectionSettings.snoozeUntil : undefined);
    this.arm('recording', camera.recordingSettings?.paused ? camera.recordingSettings.pausedUntil : undefined);
    this.arm('privacy', camera.privacy?.enabled ? camera.privacy.until : undefined);
  }

  public dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.ends.clear();
  }

  private arm(kind: PauseKind, until: number | undefined): void {
    if (this.ends.has(kind) && this.ends.get(kind) === until) return;
    clearTimeout(this.timers.get(kind));
    this.timers.delete(kind);
    this.ends.set(kind, until);
    if (until === undefined) return;

    const timer = setTimeout(
      () => {
        this.timers.delete(kind);
        this.ends.delete(kind);
        if (until > Date.now()) this.arm(kind, until);
        else new CamerasService().patchCameraByName(this.cameraName(), RESUME[kind]).catch((error) => this.logger.error(`Failed to end the ${kind} pause:`, error));
      },
      Math.min(Math.max(until - Date.now(), 0), MAX_DELAY_MS),
    );
    this.timers.set(kind, timer);
  }
}

export function detectionPaused(camera: Pick<BaseCamera, 'detectionSettings' | 'privacy'>): boolean {
  if (camera.detectionSettings.snooze) return true;
  return camera.privacy.enabled && camera.privacy.pauseRecording;
}

export function settlePauses(before: DBCamera, camera: DBCamera, patch: DeepPartial<DBCamera>, now = Date.now()): void {
  const { snoozeSince: _snoozeSince, snoozeUntil: _snoozeUntil, ...detection } = camera.detectionSettings;
  const snooze = settle(
    { on: !!before.detectionSettings.snooze, since: before.detectionSettings.snoozeSince },
    !!detection.snooze,
    patch.detectionSettings?.snooze === undefined ? camera.detectionSettings.snoozeUntil : patch.detectionSettings.snoozeUntil,
    now,
  );
  camera.detectionSettings = { ...detection, snooze: snooze.on, ...(snooze.since && { snoozeSince: snooze.since }), ...(snooze.until && { snoozeUntil: snooze.until }) };

  const { pausedSince: _pausedSince, pausedUntil: _pausedUntil, paused: _paused, ...recording } = camera.recordingSettings;
  const pause = settle(
    { on: !!before.recordingSettings.paused, since: before.recordingSettings.pausedSince },
    !!camera.recordingSettings.paused && camera.recordingSettings.enabled,
    patch.recordingSettings?.paused === undefined ? camera.recordingSettings.pausedUntil : patch.recordingSettings.pausedUntil,
    now,
  );
  camera.recordingSettings = {
    ...recording,
    ...(pause.on && { paused: true }),
    ...(pause.since && { pausedSince: pause.since }),
    ...(pause.until && { pausedUntil: pause.until }),
  };

  const { since: _since, until: _until, ...privacy } = camera.privacy;
  const mode = settle(
    { on: before.privacy.enabled, since: before.privacy.since },
    privacy.enabled,
    patch.privacy?.enabled === undefined ? camera.privacy.until : patch.privacy.until,
    now,
  );
  camera.privacy = { ...privacy, enabled: mode.on, ...(mode.since && { since: mode.since }), ...(mode.until && { until: mode.until }) };
}

function settle(before: Pause, on: boolean, until: number | undefined, now: number): Pause {
  if (!on || (until !== undefined && until <= now)) return { on: false };
  return { on: true, since: before.on ? (before.since ?? now) : now, until };
}
