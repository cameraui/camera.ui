import { PTZCapability, PTZProperty } from '@camera.ui/sdk';

import { NamespaceManager } from '../../../rpc/namespaces.js';
import { PAN_TO_IMAGE_RATIO } from '../detection-pipeline.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { Detection, PtzAutotrackSettings, PTZPosition, PTZRelativeMove, SensorLike, TrackedDetection } from '@camera.ui/sdk';
import type { PropertyChangedEvent } from '@camera.ui/sdk/internal';

export interface PtzPoseDelta {
  panDelta: number;
  tiltDelta: number;
}

const MIN_SPEED = 0.4;
const MAX_SPEED = 1.0;
const MIN_PULSE_MS = 250;
const MAX_PULSE_MS = 1000;

const MIN_COMMAND_INTERVAL_MS = 200;
const STATIONARY_SPEED_THRESHOLD = 0.006;
const MAX_LEAD_DISPLACEMENT = 0.45;

const POSE_EPSILON = 0.002;
const AIM_SETTLE_MS = 600;
const EDGE_TOUCH_MARGIN = 0.02;
const EDGE_ERR_FLOOR = 0.3;
const POST_STOP_MOTION_SETTLE_MS = 1200;
const MOVE_WATCHDOG_MS = 5000;
const EXTERNAL_COOLDOWN_MS = 45_000;

const DEFAULT_SPEED_GAIN = 2.0;
const DEFAULT_LEAD_MS = 1800;
const DEFAULT_PAN_RATE = 0.85;

type MoveStrategy = 'relative' | 'absolute' | 'velocity';

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
  getFps?: () => number;
  onSuppressionActivated: () => void;
}

export class PtzAutotracker {
  private sensorInfo?: PtzSensorInfo;
  private watcherUnsubscribe?: () => void;
  private settings?: PtzAutotrackSettings;

  private isPtzMoving = false;
  private state: AutotrackState = 'idle';
  private activeTrackId?: number;
  private targetCentered = false;
  private lostSinceTs = 0;
  private lastCommandAt = 0;
  private stopTimer?: NodeJS.Timeout;
  private moveWatchdog?: NodeJS.Timeout;
  private lastStopIssuedAt = 0;
  private ownMoveUntil = 0;
  private externalControlUntil = 0;
  private lastStrategy?: MoveStrategy;
  private currentPose: { pan: number; tilt: number; zoom: number } = { pan: 0, tilt: 0, zoom: 0 };

  private lastMove?: { pose: { pan: number; tilt: number }; panDir: number; tiltDir: number };
  private pinnedPan?: { dir: number; pose: number };
  private pinnedTilt?: { dir: number; pose: number };
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

    try {
      const values = await this.getPtzRpc(info).getValues();
      const initialPos = values[PTZProperty.Position] as PTZPosition | undefined;
      if (initialPos) {
        this.currentPose = { pan: initialPos.pan ?? 0, tilt: initialPos.tilt ?? 0, zoom: initialPos.zoom ?? 0 };
      }
    } catch {
      // ignore
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

    // frames right after a stop were captured mid-move, aiming on them
    // overshoots; shorter than the motion settle, a post-stop frame suffices
    if (this.isPtzMoving) {
      return;
    }
    if (this.lastStopIssuedAt > 0 && now - this.lastStopIssuedAt < AIM_SETTLE_MS) {
      return;
    }

    // a human recently drove the camera, back off until the cooldown ends
    if (now < this.externalControlUntil) {
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

    // external sensors only extend the LOST grace, never drive the motor
    if (present && this.state === 'lost') {
      this.lostSinceTs = Date.now();
    }
  }

  public dispose(): void {
    this.teardown();
  }

  public consumePoseDelta(): PtzPoseDelta | undefined {
    if (!this.referencePose) return undefined;
    // emit even (0,0) once seeded: toggling the transform mid-session would
    // strand earlier filter state in the old frame
    return {
      panDelta: this.currentPose.pan - this.referencePose.pan,
      tiltDelta: this.currentPose.tilt - this.referencePose.tilt,
    };
  }

  private pickLargestFresh(targets: readonly TrackedDetection[]): TrackedDetection | undefined {
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
    return best;
  }

  private follow(target: TrackedDetection): void {
    this.activeTrackId = target.trackId;
    this.targetCentered = false;
    this.state = 'active';
  }

  private stepIdle(targets: readonly TrackedDetection[]): void {
    const best = this.pickLargestFresh(targets);
    if (!best) return;
    this.deps.logger.trace(`[autotracker] following ${best.label}#${best.trackId}`);
    this.follow(best);
  }

  private stepActive(ptz: PtzSensorInfo, targets: readonly TrackedDetection[], settings: PtzAutotrackSettings, now: number): void {
    const target = targets.find((t) => t.trackId === this.activeTrackId);
    if (!target) {
      this.deps.logger.trace(`[autotracker] lost target #${this.activeTrackId}`);
      this.state = 'lost';
      this.lostSinceTs = now;
      return;
    }

    // extrapolated boxes drift off-frame over a long miss, wait for a real match
    if (target.trackLost) {
      return;
    }

    const cx = target.box.x + target.box.width * 0.5;
    const cy = target.box.y + target.box.height * 0.5;

    // lead across the camera's move+settle blind window; velocity is per frame
    const leadMs = settings.leadMs ?? DEFAULT_LEAD_MS;
    const fps = this.deps.getFps?.() ?? 10;
    const blindFrames = (leadMs / 1000) * fps;
    const velocity = target.trackVelocity;
    const leadX = clamp((velocity?.x ?? 0) * blindFrames, -MAX_LEAD_DISPLACEMENT, MAX_LEAD_DISPLACEMENT);
    const leadY = clamp((velocity?.y ?? 0) * blindFrames, -MAX_LEAD_DISPLACEMENT, MAX_LEAD_DISPLACEMENT);

    let errX = cx + leadX - 0.5;
    let errY = cy + leadY - 0.5;

    // clipped box at a frame edge: keep pushing toward that edge
    if (target.box.x <= EDGE_TOUCH_MARGIN && errX < 0) {
      errX = Math.min(errX, -EDGE_ERR_FLOOR);
    } else if (target.box.x + target.box.width >= 1 - EDGE_TOUCH_MARGIN && errX > 0) {
      errX = Math.max(errX, EDGE_ERR_FLOOR);
    }
    if (target.box.y <= EDGE_TOUCH_MARGIN && errY < 0) {
      errY = Math.min(errY, -EDGE_ERR_FLOOR);
    } else if (target.box.y + target.box.height >= 1 - EDGE_TOUCH_MARGIN && errY > 0) {
      errY = Math.max(errY, EDGE_ERR_FLOOR);
    }

    const deadZone = settings.triggerDeadZone;

    const outsideDeadZone = Math.abs(errX) > deadZone || Math.abs(errY) > deadZone;
    if (!outsideDeadZone) {
      this.targetCentered = true;
      return;
    }

    // jitter gate only for targets already centered once: a still person
    // off-center must stay approachable, large errors bypass a low velocity
    const trackSpeed = target.trackSpeed ?? 0;
    const errMag = Math.max(Math.abs(errX), Math.abs(errY));
    const largeError = errMag > deadZone * 2;
    if (this.targetCentered && !largeError && trackSpeed < STATIONARY_SPEED_THRESHOLD) {
      return;
    }

    if (now - this.lastCommandAt < MIN_COMMAND_INTERVAL_MS) return;

    const strategy = this.pickStrategy(ptz);
    if (strategy !== this.lastStrategy) {
      this.lastStrategy = strategy;
      this.deps.logger.trace(`[autotracker] move strategy: ${strategy}`);
    }

    // command space for the displacement strategies: pan +right, tilt +up
    const cmdPan = Math.abs(errX) <= deadZone ? 0 : errX;
    const cmdTilt = Math.abs(errY) <= deadZone ? 0 : -errY;

    if (strategy === 'relative') {
      // err is already in frame fractions, the firmware drives the exact distance
      const move = this.applyPins(cmdPan, cmdTilt);
      if (!move) return;
      this.lastCommandAt = now;
      this.rememberMove(Math.sign(move.pan), Math.sign(move.tilt));
      this.sendRelativeMove(ptz, { panDelta: move.pan, tiltDelta: move.tilt, zoomDelta: 0 });
      this.deps.logger.trace(`[autotracker] relative move err=(${errX.toFixed(2)},${errY.toFixed(2)})`);
      return;
    }

    if (strategy === 'absolute') {
      const move = this.applyPins(cmdPan, cmdTilt);
      if (!move) return;
      const target = {
        pan: clamp(this.currentPose.pan + move.pan / PAN_TO_IMAGE_RATIO, -1, 1),
        tilt: clamp(this.currentPose.tilt + move.tilt / PAN_TO_IMAGE_RATIO, -1, 1),
        zoom: this.currentPose.zoom,
      };

      // a space-limit clamp can pin the target onto the pose; a 360° camera
      // can cross that seam, but only via the velocity pulse below
      const panProgress = Math.abs(target.pan - this.currentPose.pan) > POSE_EPSILON;
      const tiltProgress = Math.abs(target.tilt - this.currentPose.tilt) > POSE_EPSILON;
      if (panProgress || tiltProgress) {
        this.lastCommandAt = now;
        // clamped axes stay dir 0: the clamp is not an end-stop
        this.rememberMove(panProgress ? Math.sign(move.pan) : 0, tiltProgress ? Math.sign(move.tilt) : 0);
        this.sendAbsoluteMove(ptz, target);
        this.deps.logger.trace(`[autotracker] absolute move to (${target.pan.toFixed(3)},${target.tilt.toFixed(3)}) err=(${errX.toFixed(2)},${errY.toFixed(2)})`);
        return;
      }

      this.deps.logger.trace(`[autotracker] absolute target pinned at space limits, trying velocity err=(${errX.toFixed(2)},${errY.toFixed(2)})`);
    }

    // minor axis speed scaled so both arrive together: an independent
    // MIN_SPEED floor overshot during the shared pulse and drove a staircase
    const speedGain = settings.trackingSpeed ?? DEFAULT_SPEED_GAIN;
    const panRate = settings.panRate ?? DEFAULT_PAN_RATE;
    const absX = Math.abs(errX) <= deadZone ? 0 : Math.abs(errX);
    const absY = Math.abs(errY) <= deadZone ? 0 : Math.abs(errY);
    const domErr = Math.max(absX, absY);
    const domSpeed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, domErr * speedGain));

    // pulse sized to close the dominant error once, panRate = travel/s at full speed
    const estMs = (domErr / Math.max(0.01, domSpeed * panRate)) * 1000;
    const pulseMs = Math.max(MIN_PULSE_MS, Math.min(MAX_PULSE_MS, estMs));
    const pulseSec = pulseMs / 1000;
    const minorSpeed = (err: number) => Math.min(MAX_SPEED, err / Math.max(0.01, panRate * pulseSec));

    // tilt is inverted: image Y grows downward, positive ONVIF tilt rotates up
    const finalPan = absX === 0 ? 0 : Math.sign(errX) * (absX === domErr ? domSpeed : minorSpeed(absX));
    const finalTilt = absY === 0 ? 0 : -Math.sign(errY) * (absY === domErr ? domSpeed : minorSpeed(absY));

    this.sendVelocity(ptz, { panSpeed: finalPan, tiltSpeed: finalTilt, zoomSpeed: 0 });
    this.lastCommandAt = now;
    this.deps.logger.trace(
      `[autotracker] move pan=${finalPan.toFixed(2)} tilt=${finalTilt.toFixed(2)} pulse=${Math.round(pulseMs)}ms err=(${errX.toFixed(2)},${errY.toFixed(2)})`,
    );

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

  private pickStrategy(ptz: PtzSensorInfo): MoveStrategy {
    if (ptz.capabilities.includes(PTZCapability.RelativeMove)) return 'relative';
    // absolute needs real pose feedback, referencePose proves we get it
    if (ptz.capabilities.includes(PTZCapability.AbsolutePosition) && this.referencePose) return 'absolute';
    return 'velocity';
  }

  private applyPins(pan: number, tilt: number): { pan: number; tilt: number } | undefined {
    this.evaluatePins();
    if (this.pinnedPan && pan !== 0 && Math.sign(pan) !== this.pinnedPan.dir) this.pinnedPan = undefined;
    if (this.pinnedTilt && tilt !== 0 && Math.sign(tilt) !== this.pinnedTilt.dir) this.pinnedTilt = undefined;
    const outPan = this.pinnedPan ? 0 : pan;
    const outTilt = this.pinnedTilt ? 0 : tilt;
    if (outPan === 0 && outTilt === 0) return undefined;
    return { pan: outPan, tilt: outTilt };
  }

  private evaluatePins(): void {
    const last = this.lastMove;
    if (!last) return;
    this.lastMove = undefined;
    // without real pose feedback a zero delta proves nothing
    if (!this.referencePose) return;
    if (last.panDir !== 0 && Math.abs(this.currentPose.pan - last.pose.pan) < POSE_EPSILON) {
      this.pinnedPan = { dir: last.panDir, pose: this.currentPose.pan };
      this.deps.logger.trace(`[autotracker] pan axis at end-stop, skipping until error flips (dir=${last.panDir})`);
    }
    if (last.tiltDir !== 0 && Math.abs(this.currentPose.tilt - last.pose.tilt) < POSE_EPSILON) {
      this.pinnedTilt = { dir: last.tiltDir, pose: this.currentPose.tilt };
      this.deps.logger.trace(`[autotracker] tilt axis at end-stop, skipping until error flips (dir=${last.tiltDir})`);
    }
  }

  private rememberMove(panDir: number, tiltDir: number): void {
    this.lastMove = { pose: { pan: this.currentPose.pan, tilt: this.currentPose.tilt }, panDir, tiltDir };
  }

  private sendRelativeMove(ptz: PtzSensorInfo, move: PTZRelativeMove): void {
    this.markOwnMoveStart();
    this.getPtzRpc(ptz)
      .updateValue(PTZProperty.RelativeMove, move)
      .catch(() => {});
  }

  private sendAbsoluteMove(ptz: PtzSensorInfo, target: { pan: number; tilt: number; zoom: number }): void {
    this.markOwnMoveStart();
    this.getPtzRpc(ptz)
      .updateValue(PTZProperty.Position, target)
      .catch(() => {});
  }

  private markOwnMoveStart(): void {
    const was = this.isPtzMoving;
    this.isPtzMoving = true;
    this.ownMoveUntil = Date.now() + MOVE_WATCHDOG_MS;
    if (!was) {
      this.deps.onSuppressionActivated();
    }

    this.clearMoveWatchdog();
    this.moveWatchdog = setTimeout(() => {
      this.moveWatchdog = undefined;
      if (this.isPtzMoving) {
        this.isPtzMoving = false;
        this.lastStopIssuedAt = Date.now();
      }
    }, MOVE_WATCHDOG_MS);
  }

  private clearMoveWatchdog(): void {
    if (this.moveWatchdog) {
      clearTimeout(this.moveWatchdog);
      this.moveWatchdog = undefined;
    }
  }

  private stepLost(ptz: PtzSensorInfo, targets: readonly TrackedDetection[], settings: PtzAutotrackSettings, now: number): void {
    const reappeared = targets.find((t) => t.trackId === this.activeTrackId);
    if (reappeared) {
      this.state = 'active';
      return;
    }

    // same person under a new id after detector churn, or a new person:
    // beats staring at an empty spot until the home timeout
    const successor = this.pickLargestFresh(targets);
    if (successor) {
      this.deps.logger.trace(`[autotracker] reacquired ${successor.label}#${successor.trackId} (was #${this.activeTrackId})`);
      this.follow(successor);
      return;
    }

    if (!settings.returnToHome) return;
    if (now - this.lostSinceTs < settings.homeWaitMs) return;

    if (ptz.capabilities.includes(PTZCapability.Home)) {
      this.deps.logger.trace('[autotracker] returning to home preset');
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
    this.currentPose = {
      pan: pos.pan ?? this.currentPose.pan,
      tilt: pos.tilt ?? this.currentPose.tilt,
      zoom: pos.zoom ?? this.currentPose.zoom,
    };
    // pose moved off the pin (external reposition), axis is drivable again
    if (this.pinnedPan && Math.abs(this.currentPose.pan - this.pinnedPan.pose) > POSE_EPSILON) this.pinnedPan = undefined;
    if (this.pinnedTilt && Math.abs(this.currentPose.tilt - this.pinnedTilt.pose) > POSE_EPSILON) this.pinnedTilt = undefined;
    // seed from a real event, the SDK's (0,0) default would feed a spurious
    // world-scale offset to the tracker on frame 1
    this.referencePose ??= { pan: this.currentPose.pan, tilt: this.currentPose.tilt };
  }

  private handleMovementChange(moving: boolean): void {
    const now = Date.now();
    const was = this.isPtzMoving;
    this.isPtzMoving = moving;

    if (moving && now > this.ownMoveUntil) {
      // nothing of ours is in flight: a human drives the camera
      if (now >= this.externalControlUntil) {
        this.deps.logger.trace(`[autotracker] external ptz control, backing off for ${EXTERNAL_COOLDOWN_MS / 1000}s`);
      }
      this.externalControlUntil = now + EXTERNAL_COOLDOWN_MS;
    } else if (!moving && now < this.externalControlUntil) {
      // cooldown counts from the last external stop
      this.externalControlUntil = now + EXTERNAL_COOLDOWN_MS;
    }

    if (was === moving) return;
    this.deps.logger.trace(`[autotracker] camera ${moving ? 'moving' : 'stopped'} (reported)`);
    if (moving) {
      // blank motion bboxes, frame-diff is unusable during ego-motion
      this.deps.onSuppressionActivated();
    } else {
      // external stops get the same settle window as our own
      this.lastStopIssuedAt = now;
      this.clearMoveWatchdog();
    }
  }

  private reset(): void {
    this.state = 'idle';
    this.activeTrackId = undefined;
    this.targetCentered = false;
    this.lostSinceTs = 0;
    this.lastCommandAt = 0;
    this.lastStopIssuedAt = 0;
    this.ownMoveUntil = 0;
    this.externalControlUntil = 0;
    this.lastStrategy = undefined;
    this.lastMove = undefined;
    this.pinnedPan = undefined;
    this.pinnedTilt = undefined;
    this.clearStopTimer();
    this.clearMoveWatchdog();
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
    this.currentPose = { pan: 0, tilt: 0, zoom: 0 };
    this.referencePose = undefined;
    this.reset();
  }

  private sendVelocity(ptz: PtzSensorInfo, v: { panSpeed: number; tiltSpeed: number; zoomSpeed: number }): void {
    const isStop = v.panSpeed === 0 && v.tiltSpeed === 0 && v.zoomSpeed === 0;
    const wasMoving = this.isPtzMoving;
    this.isPtzMoving = !isStop;
    this.ownMoveUntil = Date.now() + MOVE_WATCHDOG_MS;
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
