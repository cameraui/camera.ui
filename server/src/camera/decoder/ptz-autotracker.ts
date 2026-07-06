import { PTZCapability, PTZProperty } from '@camera.ui/sdk';

import { NamespaceManager } from '../../rpc/namespaces.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { Detection, PtzAutotrackSettings, PTZPosition, SensorLike, TrackedDetection } from '@camera.ui/sdk';
import type { PropertyChangedEvent } from '@camera.ui/sdk/internal';

export interface PtzPoseDelta {
  panDelta: number;
  tiltDelta: number;
}

const MIN_SPEED = 0.4;
const MAX_SPEED = 1.0;
const SPEED_GAIN = 2.0;
const PAN_RATE_AT_MAX_SPEED = 0.85;
const MIN_PULSE_MS = 250;
const MAX_PULSE_MS = 1000;

// Prevents rapid-fire re-issues; also protects PTZ firmware.
const MIN_COMMAND_INTERVAL_MS = 200;

// Norfair Kalman speed below which we treat the target as standing still.
// Bbox center jitter for a stationary person is ~0.002-0.005 normalized
// units per frame (head sway, bbox size fluctuation). Replaces an older
// per-frame "confirm streak" debounce.
const STATIONARY_SPEED_THRESHOLD = 0.006;

// How long `suppressionActive` stays true AFTER the motor stop command.
// Frame-diff is unreliable during motor decel (~100-300ms physical), stream
// buffer drain (~500-1500ms mid-pan frames), and frame-diff settling.
const POST_STOP_MOTION_SETTLE_MS = 800;

type AutotrackState = 'idle' | 'active' | 'lost';

export interface PtzSensorInfo {
  pluginId: string;
  sensorId: string;
  capabilities: string[];
}

export interface PtzAutotrackerDeps {
  logger: Logger;
  proxy: RPCClient;
  cameraId: string;
  settings?: PtzAutotrackSettings;
  onSuppressionActivated: () => void;
}

export class PtzAutotracker {
  private sensorInfo?: PtzSensorInfo;
  private watcherUnsubscribe?: () => void;
  private settings?: PtzAutotrackSettings;

  private isPtzMoving = false;
  private state: AutotrackState = 'idle';
  private activeTrackId?: number;
  private lostSinceTs = 0;
  private lastCommandAt = 0;
  private stopTimer?: NodeJS.Timeout;
  private lastStopIssuedAt = 0;
  private currentPose: { pan: number; tilt: number } = { pan: 0, tilt: 0 };

  // PTZ pose at the first observed Position event. consumePoseDelta() returns
  // the ACCUMULATED offset from this reference (not a per-frame delta) —
  // Norfair's TranslationTransformation needs a consistent reference across
  // all frames. Seeded lazily on the first real Position event (not in
  // bind()) because getValues() during bind can race with the plugin's first
  // pollStatus(), yielding a phantom (0,0) reference.
  private referencePose?: { pan: number; tilt: number };

  constructor(private readonly deps: PtzAutotrackerDeps) {
    this.settings = deps.settings;
  }

  public updateSettings(settings: PtzAutotrackSettings | undefined): void {
    this.settings = settings;
    if (!settings?.enabled) this.reset();
  }

  public get suppressionActive(): boolean {
    if (this.isPtzMoving) return true;
    if (this.lastStopIssuedAt > 0 && Date.now() - this.lastStopIssuedAt < POST_STOP_MOTION_SETTLE_MS) return true;
    return false;
  }

  public isBoundTo(sensorId: string): boolean {
    return this.sensorInfo?.sensorId === sensorId;
  }

  public async bind(info: PtzSensorInfo): Promise<void> {
    this.teardown();
    this.sensorInfo = { ...info, capabilities: [...info.capabilities] };

    // Seed currentPose as a warm start — but NOT referencePose. SDK default
    // is (0,0,0) and getValues() can race with the plugin's first pollStatus.
    // Lazy-seeding referencePose on the first real Position event guarantees
    // it matches the camera's actual pose.
    try {
      const values = await this.getPtzRpc(info).getValues();
      const initialPos = values[PTZProperty.Position] as PTZPosition | undefined;
      if (initialPos) {
        this.currentPose = { pan: initialPos.pan ?? 0, tilt: initialPos.tilt ?? 0 };
      }
    } catch {
      // Non-fatal: referencePose is lazy-seeded from the first Position event.
    }

    const subject = NamespaceManager.sensorEventNamespaces(this.deps.cameraId, info.sensorId).sensorSubject;
    this.watcherUnsubscribe = await this.deps.proxy.subscribe<{ type: string; data: PropertyChangedEvent }>(subject, (msg) => {
      if (msg.type !== 'property:changed') return;
      if (msg.data.sensorId !== this.sensorInfo?.sensorId) return;
      if ((msg.data.property as PTZProperty) === PTZProperty.Moving) {
        this.handleMovementChange(msg.data.value as boolean);
      } else if ((msg.data.property as PTZProperty) === PTZProperty.Position) {
        this.handlePositionChange(msg.data.value as PTZPosition | undefined);
      }
    });
  }

  public unbind(sensorId: string): void {
    if (this.sensorInfo?.sensorId !== sensorId) return;
    this.teardown();
  }

  public setCapabilities(sensorId: string, capabilities: string[]): void {
    if (this.sensorInfo?.sensorId !== sensorId) return;
    this.sensorInfo.capabilities = [...capabilities];
  }

  public handleObjectDetections(detections: readonly TrackedDetection[]): void {
    const settings = this.settings;
    if (!settings?.enabled) return;
    const ptz = this.sensorInfo;
    if (!ptz) return;

    const now = Date.now();

    // Gate on motor state. If the PTZ is moving (our command OR user via
    // vendor app), we're in read-only mode — no decisions. The `moving`
    // signal comes from the ONVIF plugin's GetStatus poller (not our own
    // command echo) so it reflects the actual motor state. With Norfair's
    // camera-motion compensation active the tracker still runs through the
    // pan — we just don't issue new commands while one is in flight.
    if (this.isPtzMoving) {
      return;
    }

    const targets = this.filterTargets(detections, settings);

    switch (this.state) {
      case 'idle':
        this.stepIdle(targets);
        return;
      case 'active':
        this.stepActive(ptz, targets, settings, now);
        return;
      case 'lost':
        this.stepLost(ptz, targets, settings, now);
        return;
    }
  }

  public handlePresenceDetections(detections: readonly Detection[]): void {
    const settings = this.settings;
    if (!settings?.enabled) return;
    if (!this.sensorInfo) return;

    let present = false;
    for (const d of detections) {
      if (!settings.targetLabels.includes(d.label)) continue;
      if (d.confidence < settings.minConfidence) continue;
      present = true;
      break;
    }
    // If presence is active and we're in LOST, reset the grace timer so a
    // bracketing external sensor extends tracking intent. We don't upgrade
    // to ACTIVE — only the drivable path owns motor decisions.
    if (present && this.state === 'lost') {
      this.lostSinceTs = Date.now();
    }
  }

  public dispose(): void {
    this.teardown();
  }

  public consumePoseDelta(): PtzPoseDelta | undefined {
    if (!this.referencePose) return undefined;
    // Always return a delta once the reference is set — even (0,0). Switching
    // between "no transform" and "transform applied" mid-session leaves
    // earlier filter state in the old frame while new detections arrive in
    // the new one.
    return {
      panDelta: this.currentPose.pan - this.referencePose.pan,
      tiltDelta: this.currentPose.tilt - this.referencePose.tilt,
    };
  }

  private stepIdle(targets: readonly TrackedDetection[]): void {
    if (targets.length === 0) return;
    // Pick the largest bbox as the one to follow. Skip Kalman-extrapolated
    // tracks — those don't correspond to a fresh detection this frame and
    // could be anywhere; locking onto one sends the motor chasing a guess.
    // No user-facing priority setting — "largest" is the intuitive default.
    let best: TrackedDetection | undefined;
    let bestArea = -1;
    for (const t of targets) {
      if (typeof t.trackId !== 'number') continue;
      if (t.trackLost) continue;
      const area = t.box.width * t.box.height;
      if (area > bestArea) {
        best = t;
        bestArea = area;
      }
    }
    if (!best || typeof best.trackId !== 'number') return;

    this.activeTrackId = best.trackId;
    this.state = 'active';
  }

  private stepActive(ptz: PtzSensorInfo, targets: readonly TrackedDetection[], settings: PtzAutotrackSettings, now: number): void {
    const target = targets.find((t) => t.trackId === this.activeTrackId);
    if (!target) {
      this.state = 'lost';
      this.lostSinceTs = now;
      return;
    }

    // Extrapolated track (Kalman kept it alive through a detector miss).
    // Don't drive the motor on a ghost: during a short blink the filter's
    // predicted position is a reasonable guess, but over many frames it
    // drifts outside the frame and commanding a chase sends the camera
    // off into empty air. Wait it out — the track either matches again
    // and we resume, or norfair drops it and we go LOST.
    if (target.trackLost) {
      return;
    }

    // Center-error tracking. Norfair gives us a stable track centroid and a
    // Kalman-estimated velocity — we use both. `triggerDeadZone` defines a
    // comfort box around frame center; inside it we do nothing. Outside it
    // the camera pans proportionally to close the error in one pulse.
    const cx = target.box.x + target.box.width * 0.5;
    const cy = target.box.y + target.box.height * 0.5;
    const errX = cx - 0.5;
    const errY = cy - 0.5;
    const deadZone = settings.triggerDeadZone;

    const outsideDeadZone = Math.abs(errX) > deadZone || Math.abs(errY) > deadZone;
    if (!outsideDeadZone) {
      return;
    }

    // Velocity gate: don't chase a stationary target even when slightly off-
    // center. Norfair's `track_speed` is the centroid speed from the Kalman
    // filter in normalized units per frame step — below the noise floor we
    // treat the track as "parked", which kills the ping-pong a non-moving
    // person used to produce via bbox-size jitter.
    //
    // BYPASS the gate when the error is large (> 2x dead zone): a fresh
    // detection can appear far off-center while Kalman's velocity estimate
    // is still warming up — during those first ~10 frames `speed` reads
    // artificially low and would otherwise freeze us. If the target is
    // demonstrably far from center, move regardless.
    const trackSpeed = target.trackSpeed ?? 0;
    const errMag = Math.max(Math.abs(errX), Math.abs(errY));
    const largeError = errMag > deadZone * 2;
    if (!largeError && trackSpeed < STATIONARY_SPEED_THRESHOLD) {
      return;
    }

    if (now - this.lastCommandAt < MIN_COMMAND_INTERVAL_MS) return;

    // Proportional-to-error velocity. Tilt is inverted: image Y goes down
    // but positive ONVIF tilt rotates the camera up.
    const panMag = Math.abs(errX) * SPEED_GAIN;
    const tiltMag = Math.abs(errY) * SPEED_GAIN;
    const finalPan = Math.abs(errX) <= deadZone ? 0 : Math.sign(errX) * Math.min(MAX_SPEED, Math.max(MIN_SPEED, panMag));
    const finalTilt = Math.abs(errY) <= deadZone ? 0 : -Math.sign(errY) * Math.min(MAX_SPEED, Math.max(MIN_SPEED, tiltMag));

    // Proportional pulse duration — stop once we've closed roughly the
    // error. Prevents overshoot on tiny adjustments.
    const speedMag = Math.max(Math.abs(finalPan), Math.abs(finalTilt));
    const pulseErrMag = Math.max(Math.abs(finalPan) > 0 ? Math.abs(errX) : 0, Math.abs(finalTilt) > 0 ? Math.abs(errY) : 0);
    const estMs = (pulseErrMag / Math.max(0.01, speedMag * PAN_RATE_AT_MAX_SPEED)) * 1000;
    const pulseMs = Math.max(MIN_PULSE_MS, Math.min(MAX_PULSE_MS, estMs));

    this.sendVelocity(ptz, { panSpeed: finalPan, tiltSpeed: finalTilt, zoomSpeed: 0 });
    this.lastCommandAt = now;

    // Schedule the stop. Clear any earlier pending stop — if we issue two
    // moves back-to-back (shouldn't happen given the moving-gate but be
    // defensive), the more recent stop is the one that matters.
    this.clearStopTimer();
    this.stopTimer = setTimeout(() => {
      this.stopTimer = undefined;
      if (!this.sensorInfo) return;
      this.sendVelocity(this.sensorInfo, { panSpeed: 0, tiltSpeed: 0, zoomSpeed: 0 });
    }, pulseMs);
  }

  private clearStopTimer(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = undefined;
    }
  }

  private stepLost(ptz: PtzSensorInfo, targets: readonly TrackedDetection[], settings: PtzAutotrackSettings, now: number): void {
    const reappeared = targets.find((t) => t.trackId === this.activeTrackId);
    if (reappeared) {
      this.state = 'active';
      return;
    }

    if (!settings.returnToHome) return;
    if (now - this.lostSinceTs < settings.homeWaitMs) return;

    if (ptz.capabilities.includes(PTZCapability.Home)) {
      this.sendPosition(ptz, { pan: 0, tilt: 0, zoom: 0 });
    }
    this.activeTrackId = undefined;
    this.state = 'idle';
  }

  private filterTargets(detections: readonly TrackedDetection[], settings: PtzAutotrackSettings): readonly TrackedDetection[] {
    const out: TrackedDetection[] = [];
    for (const d of detections) {
      if (!settings.targetLabels.includes(d.label)) continue;
      if (d.confidence < settings.minConfidence) continue;
      out.push(d);
    }
    return out;
  }

  private handlePositionChange(pos: PTZPosition | undefined): void {
    if (!pos) return;
    this.currentPose = { pan: pos.pan ?? this.currentPose.pan, tilt: pos.tilt ?? this.currentPose.tilt };
    // Seed the Norfair reference frame on the very first real position
    // event so it matches whatever pose the camera is actually at. Must
    // wait for a real event because the SDK's default is (0,0) and using
    // that as reference would produce a spurious offset of "real pose
    // minus zero" on frame 1 — a world-scale shift fed to the tracker.
    this.referencePose ??= { ...this.currentPose };
  }

  private handleMovementChange(moving: boolean): void {
    const was = this.isPtzMoving;
    this.isPtzMoving = moving;
    if (was === moving) return;
    if (moving && !was) {
      // Transition into motion (our command OR user via vendor app).
      // Notify the coordinator so it can blank motion bboxes for the
      // duration — frame-diff is unusable during ego-motion.
      this.deps.onSuppressionActivated();
    }
  }

  private reset(): void {
    this.state = 'idle';
    this.activeTrackId = undefined;
    this.lostSinceTs = 0;
    this.lastCommandAt = 0;
    this.lastStopIssuedAt = 0;
    this.clearStopTimer();
  }

  private teardown(): void {
    if (this.watcherUnsubscribe) {
      try {
        this.watcherUnsubscribe();
      } catch {
        // ignore
      }
      this.watcherUnsubscribe = undefined;
    }
    this.sensorInfo = undefined;
    this.isPtzMoving = false;
    this.currentPose = { pan: 0, tilt: 0 };
    this.referencePose = undefined;
    this.reset();
  }

  private sendVelocity(ptz: PtzSensorInfo, v: { panSpeed: number; tiltSpeed: number; zoomSpeed: number }): void {
    const isStop = v.panSpeed === 0 && v.tiltSpeed === 0 && v.zoomSpeed === 0;
    const wasMoving = this.isPtzMoving;
    this.isPtzMoving = !isStop;
    if (!isStop && !wasMoving) {
      this.deps.onSuppressionActivated();
    }
    if (isStop) {
      this.lastStopIssuedAt = Date.now();
    }
    this.getPtzRpc(ptz)
      .updateValue(PTZProperty.Velocity, v)
      .catch(() => {});
  }

  private sendPosition(ptz: PtzSensorInfo, p: { pan: number; tilt: number; zoom: number }): void {
    this.getPtzRpc(ptz)
      .updateValue(PTZProperty.Position, p)
      .catch(() => {});
  }

  private getPtzRpc(ptz: PtzSensorInfo): Promisify<SensorLike> {
    const ns = NamespaceManager.sensorProviderNamespaces(ptz.pluginId, this.deps.cameraId, ptz.sensorId).sensorRpc;
    return this.deps.proxy.createProxy<SensorLike>(ns);
  }
}
