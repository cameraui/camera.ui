import { MOMENT_FORMATS, MOMENT_QUALITY } from './moment-crop.js';
import { BufferedSource } from './sources/buffered-source.js';

import type { Logger } from '@camera.ui/common/logger';
import type { FrameWorkerDecoderSettings } from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { PrivacyMask } from '../privacy/mask.js';
import type { DetectionEventManager } from './event-manager.js';
import type { FrameScaler } from './frame-scaler.js';
import type { AnalysisSource } from './sources/analysis-source.js';
import type { CoordinatorSourceUrl } from './types.js';

export const EVENT_THUMB_MAX_WIDTH = MOMENT_FORMATS[1].width;
export const EVENT_THUMB_HQ_MAX_WIDTH = MOMENT_FORMATS[1].width;
export const EVENT_THUMB_HQ_QUALITY = MOMENT_QUALITY;

const HQ_FRAME_MAX_AGE_MS = 500;

interface EventThumbnailerDeps {
  frameSource: AnalysisSource;
  frameScaler: FrameScaler;
  privacy: PrivacyMask;
  eventManager: DetectionEventManager;
  logger: Logger;
  decoder?: FrameWorkerDecoderSettings;
}

function resolveHqSource(sources?: CoordinatorSourceUrl[]): CoordinatorSourceUrl | undefined {
  if (!sources?.length) return undefined;

  const order: CoordinatorSourceUrl['role'][] = ['high-resolution', 'mid-resolution', 'low-resolution'];
  const byRole = new Map(sources.map((s) => [s.role, s]));
  const detectionRole = [...order].reverse().find((role) => byRole.has(role));
  const hqRole = order.find((role) => byRole.has(role));
  if (!detectionRole || !hqRole || hqRole === detectionRole) return undefined;

  return byRole.get(hqRole);
}

export class EventThumbnailer {
  private hqSource?: BufferedSource;
  private hqRole?: CoordinatorSourceUrl['role'];
  private upgradeInflight = false;

  constructor(
    private readonly deps: EventThumbnailerDeps,
    availableSources?: CoordinatorSourceUrl[],
  ) {
    const hq = resolveHqSource(availableSources);
    if (hq) {
      this.hqRole = hq.role;
      this.hqSource = new BufferedSource({ url: hq.url, decoder: deps.decoder, privacy: deps.privacy }, deps.logger);
    }
  }

  public get hasMainStream(): boolean {
    return this.hqSource !== undefined;
  }

  public get mainStreamRole(): CoordinatorSourceUrl['role'] | undefined {
    return this.hqRole;
  }

  public sync(wanted: boolean): void {
    if (!this.hqSource) return;

    if (wanted && !this.hqSource.isRunning) {
      this.hqSource.start();
    } else if (!wanted && this.hqSource.isRunning) {
      this.hqSource.stop();
    }
  }

  public async stop(): Promise<void> {
    await this.hqSource?.stop();
  }

  public async acquireHqFrame(maxAgeMs = HQ_FRAME_MAX_AGE_MS): Promise<{ frame: Frame; scaler: FrameScaler; rtp?: number } | null> {
    const source = this.hqSource;
    if (!source?.isRunning || !source.hasBuffer) return null;
    const scaler = source.scaler;
    if (!scaler) return null;

    const decoded = await source.decodeNewest(maxAgeMs);
    if (!decoded) return null;

    return { frame: decoded.frame, scaler, rtp: decoded.rtp };
  }

  public async captureEventThumbnail(fallbackFrame: Frame): Promise<{ jpeg?: Buffer; fromHq: boolean }> {
    const hq = await this.acquireHqFrame();
    try {
      if (hq) {
        const jpeg = await hq.scaler.frameToJPEG(hq.frame, EVENT_THUMB_HQ_MAX_WIDTH, EVENT_THUMB_HQ_QUALITY);
        if (jpeg) return { jpeg, fromHq: true };
      }
      const jpeg = await this.deps.frameScaler.frameToJPEG(fallbackFrame, EVENT_THUMB_MAX_WIDTH);
      return { jpeg: jpeg ?? undefined, fromHq: false };
    } finally {
      hq?.frame[Symbol.dispose]?.();
    }
  }

  public fetchEventThumbnailAsync(): void {
    void (async () => {
      try {
        const hqJpeg = await this.hqSource?.snapshotJpeg(EVENT_THUMB_HQ_MAX_WIDTH, EVENT_THUMB_HQ_QUALITY);
        if (hqJpeg) {
          this.deps.eventManager.publishEventThumbnail(hqJpeg);
          return;
        }

        await using handle = await this.deps.frameSource.getFrame(0);
        if (!handle) return;
        // large frames (plugin-native snapshots) can afford the HQ width
        const maxWidth = handle.frame.width >= EVENT_THUMB_HQ_MAX_WIDTH * 2 ? EVENT_THUMB_HQ_MAX_WIDTH : EVENT_THUMB_MAX_WIDTH;
        const jpeg = await this.deps.frameScaler.frameToJPEG(handle.frame, maxWidth);
        if (!jpeg) return;
        this.deps.eventManager.publishEventThumbnail(jpeg);
      } catch (e) {
        this.deps.logger.debug('event-thumb snapshot failed:', e);
      }
    })();
  }

  public upgradeEventThumbnailAsync(): void {
    const source = this.hqSource;
    if (!source?.isRunning || !source.hasBuffer || this.upgradeInflight) return;

    this.upgradeInflight = true;
    void (async () => {
      try {
        const jpeg = await source.snapshotJpeg(EVENT_THUMB_HQ_MAX_WIDTH, EVENT_THUMB_HQ_QUALITY);
        if (jpeg && this.deps.eventManager.hasActiveEvent()) {
          this.deps.eventManager.publishEventThumbnail(jpeg);
        }
      } catch (error) {
        this.deps.logger.debug('Snapshot event thumbnail upgrade failed:', error);
      } finally {
        this.upgradeInflight = false;
      }
    })();
  }
}
