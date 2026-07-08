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
const MIN_PULSE_MS = 250;
const MAX_PULSE_MS = 1000;

// Rate-limit motor commands; also protects PTZ firmware.
const MIN_COMMAND_INTERVAL_MS = 200;

// Kalman speed (normalized units/frame) below which the target counts as stationary.
const STATIONARY_SPEED_THRESHOLD = 0.006;

// Clamp the lead so a velocity spike can't fling the aim across the frame.
const MAX_LEAD_DISPLACEMENT = 0.3;

// Keep motion suppressed this long after a stop while decel + stream buffer settle.
const POST_STOP_MOTION_SETTLE_MS = 800;

// Fallbacks for the UI-configurable knobs when a stored config predates them.
const DEFAULT_SPEED_GAIN = 2.0;
const DEFAULT_LEAD_FRAMES = 3;
const DEFAULT_PAN_RATE = 0.85;

type AutotrackState = 'idle' | 'active' | 'lost';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

  // Reference pose for consumePoseDelta()'s accumulated offset — Norfair needs
  // one consistent reference across frames. Seeded lazily on the first real
  // Position event; getValues() during bind() can race the plugin's first poll
  // and yield a phantom (0,0).
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

    // Warm-start currentPose only; referencePose stays lazy (see its field).
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

    // Read-only while the motor moves (our command or the vendor app). The
    // tracker still runs through the pan via camera-motion compensation; we
    // just don't issue new commands mid-move.
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
    // A bracketing external sensor extends the LOST grace timer but never
    // upgrades to ACTIVE — only the drivable path issues motor commands.
    if (present && this.state === 'lost') {
      this.lostSinceTs = Date.now();
    }
  }

  public dispose(): void {
    this.teardown();
  }

  public consumePoseDelta(): PtzPoseDelta | undefined {
    if (!this.referencePose) return undefined;
    // Always emit a delta once seeded, even (0,0): toggling transform on/off
    // mid-session would strand earlier filter state in the old frame.
    return {
      panDelta: this.currentPose.pan - this.referencePose.pan,
      tiltDelta: this.currentPose.tilt - this.referencePose.tilt,
    };
  }

  private stepIdle(targets: readonly TrackedDetection[]): void {
    if (targets.length === 0) return;
    // Follow the largest fresh detection; skip extrapolated tracks so we don't
    // lock the motor onto a Kalman guess.
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

    // Don't drive the motor on an extrapolated track: the Kalman guess drifts
    // off-frame over a long miss. Wait for a real match or the drop to LOST.
    if (target.trackLost) {
      return;
    }

    const cx = target.box.x + target.box.width * 0.5;
    const cy = target.box.y + target.box.height * 0.5;

    // Aim where the target will be, not where it was last seen. Velocity ~0
    // for a stationary target, so the gates below are unchanged.
    const leadFrames = settings.leadFrames ?? DEFAULT_LEAD_FRAMES;
    const velocity = target.trackVelocity;
    const leadX = clamp((velocity?.x ?? 0) * leadFrames, -MAX_LEAD_DISPLACEMENT, MAX_LEAD_DISPLACEMENT);
    const leadY = clamp((velocity?.y ?? 0) * leadFrames, -MAX_LEAD_DISPLACEMENT, MAX_LEAD_DISPLACEMENT);

    const errX = cx + leadX - 0.5;
    const errY = cy + leadY - 0.5;
    const deadZone = settings.triggerDeadZone;

    const outsideDeadZone = Math.abs(errX) > deadZone || Math.abs(errY) > deadZone;
    if (!outsideDeadZone) {
      return;
    }

    // Don't chase a stationary target's bbox jitter. Bypassed on a large error
    // (> 2x dead zone): a fresh detection can be far off-center while the
    // Kalman velocity is still warming up and reads artificially low.
    const trackSpeed = target.trackSpeed ?? 0;
    const errMag = Math.max(Math.abs(errX), Math.abs(errY));
    const largeError = errMag > deadZone * 2;
    if (!largeError && trackSpeed < STATIONARY_SPEED_THRESHOLD) {
      return;
    }

    if (now - this.lastCommandAt < MIN_COMMAND_INTERVAL_MS) return;

    // Speed proportional to error. Tilt is inverted: image Y grows downward,
    // positive ONVIF tilt rotates up.
    const speedGain = settings.trackingSpeed ?? DEFAULT_SPEED_GAIN;
    const panMag = Math.abs(errX) * speedGain;
    const tiltMag = Math.abs(errY) * speedGain;
    const finalPan = Math.abs(errX) <= deadZone ? 0 : Math.sign(errX) * Math.min(MAX_SPEED, Math.max(MIN_SPEED, panMag));
    const finalTilt = Math.abs(errY) <= deadZone ? 0 : -Math.sign(errY) * Math.min(MAX_SPEED, Math.max(MIN_SPEED, tiltMag));

    // Pulse duration sized to close the error once (panRate = assumed pan
    // travel per second at full speed), so the motor stops near the target.
    const panRate = settings.panRate ?? DEFAULT_PAN_RATE;
    const speedMag = Math.max(Math.abs(finalPan), Math.abs(finalTilt));
    const pulseErrMag = Math.max(Math.abs(finalPan) > 0 ? Math.abs(errX) : 0, Math.abs(finalTilt) > 0 ? Math.abs(errY) : 0);
    const estMs = (pulseErrMag / Math.max(0.01, speedMag * panRate)) * 1000;
    const pulseMs = Math.max(MIN_PULSE_MS, Math.min(MAX_PULSE_MS, estMs));

    this.sendVelocity(ptz, { panSpeed: finalPan, tiltSpeed: finalTilt, zoomSpeed: 0 });
    this.lastCommandAt = now;

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
    // Seed the reference from a real event, not the SDK's (0,0) default, which
    // would feed a spurious world-scale offset to the tracker on frame 1.
    this.referencePose ??= { ...this.currentPose };
  }

  private handleMovementChange(moving: boolean): void {
    const was = this.isPtzMoving;
    this.isPtzMoving = moving;
    if (was === moving) return;
    if (moving && !was) {
      // Blank motion bboxes for the move — frame-diff is unusable during ego-motion.
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
