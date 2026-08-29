import type { HardwareContext } from 'node-av/api';
import type { Frame } from 'node-av/lib';
import type { FrameHandle } from './frame-handle.js';

export interface FrameSnap {
  frame: Frame;
  id: number;
  rtp?: number;
}

export interface AnalysisSource {
  readonly hardwareContext: HardwareContext | null;
  readonly fps: number;
  readonly isRunning: boolean;
  readonly lastError: Error | undefined;
  readonly generation: number;
  start(): Promise<void>;
  detach(): Promise<void>;
  stop(): Promise<void>;
  nextFrame(lastId: number): Promise<FrameSnap | undefined>;
  getFrame(maxAgeMs: number): Promise<FrameHandle | null>;
  takeDecodeStats(): { ms: number; frames: number };
  decodeOldestKeyframe?(): Promise<Frame | null>;
}
