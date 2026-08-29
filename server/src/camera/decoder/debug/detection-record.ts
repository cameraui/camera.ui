import { createWriteStream, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BoundingBox } from '@camera.ui/sdk';
import type { WriteStream } from 'node:fs';
import type { CropWindow, MomentFormatName } from '../moment-crop.js';
import type { AnalysisStream } from '../types.js';

// one global debug root for all diagnostic outputs, one subdirectory per concern
function recordDir(): string | undefined {
  const dir = process.env.CAMERA_UI_DEBUG_DIR;
  if (!dir) return undefined;
  return join(dir, 'detection-record');
}

export interface PictureRef {
  file: string;
  bytes: number;
}

export interface RecordedMoment {
  at: number;
  trigger: string;
  score: number;
  subject: BoundingBox;
  base?: BoundingBox;
  windows: Partial<Record<MomentFormatName, CropWindow>>;
  pictures: Partial<Record<MomentFormatName, PictureRef>>;
  frame?: PictureRef;
}

const ATTRIBUTE_PICTURE_INTERVAL_MS = 1000;

const cameraId = process.env.CAMERA_ID ?? 'camera';
const cameraName = process.env.CAMERA_NAME ?? cameraId;

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'camera'
  );
}

function roundBoxes(boxes?: BoundingBox[]): number[][] | undefined {
  if (!boxes || boxes.length === 0) return undefined;
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return boxes.map((b) => [r(b.x), r(b.y), r(b.width), r(b.height)]);
}

function stamp(at: number): string {
  const d = new Date(at);
  const p = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

class DetectionRecorder {
  public readonly active: boolean;

  private readonly out?: WriteStream;
  private readonly imageDir?: string;
  private readonly written = new WeakMap<Uint8Array, PictureRef>();
  private readonly lastAttributePicture = new Map<string, number>();
  private source: AnalysisStream = 'low';
  private frameWidth = 0;
  private frameHeight = 0;
  private frameRtp?: number;
  private frameRole?: string;

  constructor() {
    const dir = recordDir();
    this.active = dir !== undefined;
    if (!dir) return;

    const name = slug(cameraName);
    this.imageDir = join(dir, 'images', name);
    mkdirSync(this.imageDir, { recursive: true });
    this.out = createWriteStream(join(dir, `${cameraId}-${Date.now()}.jsonl`), { flags: 'a' });

    this.line({ camera: { id: cameraId, name: cameraName, slug: name, startedAt: Date.now() } });
  }

  public setFrame(source: AnalysisStream, width: number, height: number, rtp?: number, role?: string): void {
    this.source = source;
    this.frameWidth = width;
    this.frameHeight = height;
    this.frameRtp = rtp;
    this.frameRole = role;
  }

  public get frameStream(): AnalysisStream {
    return this.source;
  }

  public config(config: Record<string, unknown>): void {
    this.line({ config });
  }

  public sources(sources: Record<string, unknown>): void {
    this.line({ sources });
  }

  public tick(entry: Record<string, unknown>): void {
    this.line({ tick: { ...entry, stream: this.source, frame: [this.frameWidth, this.frameHeight], rtp: this.frameRtp, src: this.frameRole } });
  }

  public perf(perf: Record<string, unknown>): void {
    this.line({ perf: { ...perf, tMs: Date.now() } });
  }

  public zoom(entry: { kind: 'object' | 'assist'; anchors?: BoundingBox[]; tracks?: BoundingBox[]; windows: BoundingBox[] }): void {
    if (!this.active) return;
    this.line({
      zoom: {
        tMs: Date.now(),
        kind: entry.kind,
        anchors: roundBoxes(entry.anchors),
        tracks: roundBoxes(entry.tracks),
        windows: roundBoxes(entry.windows),
        stream: this.source,
        frame: [this.frameWidth, this.frameHeight],
      },
    });
  }

  public moment(moment: RecordedMoment): void {
    this.line({ moment: { ...moment, stream: this.source, frame: [this.frameWidth, this.frameHeight] } });
  }

  public momentVerdict(entry: Record<string, unknown>): void {
    this.line({ verdict: entry });
  }

  public attributeCandidate(label: string, entry: Record<string, unknown>, jpeg?: Uint8Array): void {
    if (!this.active) return;

    const at = Date.now();
    let picture: PictureRef | undefined;
    if (jpeg && at - (this.lastAttributePicture.get(label) ?? 0) >= ATTRIBUTE_PICTURE_INTERVAL_MS) {
      this.lastAttributePicture.set(label, at);
      picture = this.picture(at, 'attr', label, jpeg);
    }

    this.line({ attribute: { label, ...entry, stream: this.source, picture } });
  }

  public message(entry: Record<string, unknown>): void {
    this.line({ message: { ...entry, tMs: Date.now() } });
  }

  public picture(at: number, kind: string, detail: string, jpeg: Uint8Array): PictureRef | undefined {
    if (!this.imageDir || jpeg.length === 0) return undefined;

    const known = this.written.get(jpeg);
    if (known) return known;

    const parts = [stamp(at), kind, detail].filter(Boolean).join('_');
    const file = `${parts.replace(/[^A-Za-z0-9._-]+/g, '-')}.jpg`;
    const ref: PictureRef = { file, bytes: jpeg.length };
    this.written.set(jpeg, ref);

    writeFile(join(this.imageDir, file), jpeg).catch(() => {});
    return ref;
  }

  private line(value: Record<string, unknown>): void {
    this.out?.write(`${JSON.stringify(value)}\n`);
  }
}

export const detectionRecord = new DetectionRecorder();
