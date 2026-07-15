import { SnapshotSource } from './sources/snapshot-source.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Frame } from 'node-av/lib';
import type { DetectionEventManager } from './event-manager.js';
import type { FrameScaler } from './frame-scaler.js';
import type { FrameSource } from './sources/frame-source.js';
import type { CoordinatorSourceUrl } from './types.js';

export const EVENT_THUMB_MAX_WIDTH = 640;
export const EVENT_THUMB_HQ_MAX_WIDTH = 960;
export const EVENT_THUMB_HQ_QUALITY = 75;
const HQ_FRAME_MAX_AGE_MS = 500;

interface EventThumbnailerDeps {
  frameSource: FrameSource;
  frameScaler: FrameScaler;
  eventManager: DetectionEventManager;
  logger: Logger;
}

function resolveHqSourceUrl(sources?: CoordinatorSourceUrl[]): string | undefined {
  if (!sources?.length) return undefined;

  const order: CoordinatorSourceUrl['role'][] = ['high-resolution', 'mid-resolution', 'low-resolution'];
  const byRole = new Map(sources.map((s) => [s.role, s]));

  // detection consumes the lowest role, the HQ companion is only worth a
  // session when a strictly higher-resolution role exists
  const detectionRole = [...order].reverse().find((role) => byRole.has(role));
  const hqRole = order.find((role) => byRole.has(role));
  if (!detectionRole || !hqRole || hqRole === detectionRole) return undefined;

  return byRole.get(hqRole)!.url;
}

export class EventThumbnailer {
  private hqSource?: SnapshotSource;
  private upgradeInflight = false;
  private aspectWarned = false;

  constructor(
    private readonly deps: EventThumbnailerDeps,
    availableSources?: CoordinatorSourceUrl[],
  ) {
    const hqUrl = resolveHqSourceUrl(availableSources);
    if (hqUrl) {
      this.hqSource = new SnapshotSource({ url: hqUrl }, deps.logger);
    }
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

  public async acquireHqFrame(reference?: { width: number; height: number }): Promise<{ frame: Frame; scaler: FrameScaler } | null> {
    const source = this.hqSource;
    if (!source?.isRunning || !source.hasBuffer) return null;
    const scaler = source.scaler;
    if (!scaler) return null;

    const frame = await source.getFrame(HQ_FRAME_MAX_AGE_MS);
    if (!frame) return null;

    if (reference) {
      const refAspect = reference.width / reference.height;
      const hqAspect = frame.width / frame.height;
      if (Math.abs(refAspect - hqAspect) / refAspect > 0.02) {
        if (!this.aspectWarned) {
          this.aspectWarned = true;
          const detected = `${reference.width}x${reference.height}`;
          this.deps.logger.warn(`[hq-thumb] aspect mismatch (detection ${detected} vs snapshot ${frame.width}x${frame.height}) — detection crops stay on the substream`);
        }
        frame[Symbol.dispose]?.();
        return null;
      }
    }

    return { frame, scaler };
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

        await using handle = await this.deps.frameSource.fetchSnapshotFrame();
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
