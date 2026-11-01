import { boxIntersectsPolygon } from '../utils/filter.js';

import type { BoundingBox, Detection, Point } from '@camera.ui/sdk';

export const WINDOW_CAP = 3;
export const MOTION_PAD = 1.5;
export const TRACK_PAD = 1.25;

const SHRINK_PATIENCE = 5;
const FULL_FRAME_FRACTION = 0.98;
const LOOKS_BEFORE_FULL = 2;
const DEBT_PATIENCE = 12;
const CUT_EDGE = 0.01;
const FRAME_EDGE = 1e-6;

export type PlanMode = 'window' | 'sweep' | 'full';
export type LookReason = 'reset' | 'ptz' | 'motion-sensor' | 'witness';
export type WindowMode = PlanMode | 'cover';
export type WindowDetection = Detection & { clipped?: boolean };

export interface PlanRecord {
  mode: PlanMode;
  windows: BoundingBox[];
  motion: BoundingBox[];
  tracks: BoundingBox[];
  reason?: LookReason | 'no-anchors' | 'cover' | 'outside-zones';
  debt?: LookReason;
  waited?: number;
  pending: number;
}

interface Debt {
  reason: LookReason;
  plans: number;
}

interface Cluster {
  box: BoundingBox;
  lastServed: number;
  window?: BoundingBox;
  shrink: number;
  looks: number;
}

export function padBox(box: BoundingBox, factor: number): BoundingBox {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const width = Math.min(1, box.width * factor);
  const height = Math.min(1, box.height * factor);
  return {
    x: Math.min(Math.max(cx - width / 2, 0), 1 - width),
    y: Math.min(Math.max(cy - height / 2, 0), 1 - height),
    width,
    height,
  };
}

export function overlaps(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function union(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const total = a.width * a.height + b.width * b.height - inter;
  return total > 0 ? inter / total : 0;
}

export function containment(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? inter / smaller : 0;
}

export function clippedBy(box: BoundingBox, window: BoundingBox): boolean {
  const dx = CUT_EDGE * window.width;
  const dy = CUT_EDGE * window.height;
  const right = window.x + window.width;
  const bottom = window.y + window.height;
  return (
    (window.x > FRAME_EDGE && box.x - window.x <= dx) ||
    (window.y > FRAME_EDGE && box.y - window.y <= dy) ||
    (right < 1 - FRAME_EDGE && right - (box.x + box.width) <= dx) ||
    (bottom < 1 - FRAME_EDGE && bottom - (box.y + box.height) <= dy)
  );
}

export function mergeWindowDetections(detections: WindowDetection[]): WindowDetection[] {
  const kept: WindowDetection[] = [];
  for (const detection of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    const duplicate = kept.findIndex((other) => {
      if (other.label !== detection.label || other.box === undefined || detection.box === undefined) return false;
      if (iou(other.box, detection.box) >= 0.5) return true;
      // containment only dedups boxes alike in size, a small object inside a huge same-label box is distinct
      const areaA = other.box.width * other.box.height;
      const areaB = detection.box.width * detection.box.height;
      const sizeAlike = Math.min(areaA, areaB) >= Math.max(areaA, areaB) * 0.25;
      return sizeAlike && containment(other.box, detection.box) >= 0.7;
    });
    if (duplicate < 0) kept.push(detection);
    // one window that saw the body whole is enough
    else if (kept[duplicate].clipped && !detection.clipped) kept[duplicate] = { ...kept[duplicate], clipped: false };
  }
  return kept;
}

export function contains(outer: BoundingBox, inner: BoundingBox): boolean {
  return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
}

function sameBox(a: BoundingBox, b: BoundingBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function clusterBoxes(boxes: BoundingBox[]): BoundingBox[] {
  const clusters: BoundingBox[] = [];
  for (const box of boxes) {
    const hit = clusters.findIndex((cluster) => overlaps(cluster, box));
    if (hit >= 0) clusters[hit] = union(clusters[hit], box);
    else clusters.push(box);
  }

  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (overlaps(clusters[i], clusters[j])) {
          clusters[i] = union(clusters[i], clusters[j]);
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return clusters;
}

export function squareWindow(cover: BoundingBox, frameWidth: number, frameHeight: number, minSidePx: number): BoundingBox | null {
  const widthPx = cover.width * frameWidth;
  const heightPx = cover.height * frameHeight;
  const shortEdge = Math.min(frameWidth, frameHeight);
  const side = Math.min(Math.max(widthPx, heightPx, minSidePx), shortEdge);

  if (side >= FULL_FRAME_FRACTION * shortEdge) return null;

  const cx = (cover.x + cover.width / 2) * frameWidth;
  const cy = (cover.y + cover.height / 2) * frameHeight;
  const x = Math.min(Math.max(cx - side / 2, 0), frameWidth - side);
  const y = Math.min(Math.max(cy - side / 2, 0), frameHeight - side);

  return { x: x / frameWidth, y: y / frameHeight, width: side / frameWidth, height: side / frameHeight };
}

export function planWindowsOnce(boxes: BoundingBox[], pad: number, frameWidth: number, frameHeight: number, minSidePx: number): BoundingBox[] {
  const windows: BoundingBox[] = [];
  for (const cover of clusterBoxes(boxes.map((box) => padBox(box, pad)))) {
    const window = squareWindow(cover, frameWidth, frameHeight, minSidePx);
    if (!window) return [];
    windows.push(window);
    if (windows.length === WINDOW_CAP) break;
  }
  return windows;
}

export class DetectionWindow {
  private clusters: Cluster[] = [];
  private tick = 0;
  private owed?: Debt = { reason: 'reset', plans: 0 };
  private paid?: Debt;
  private last?: PlanRecord;
  private zones: Point[][] = [];

  public plan(motionAnchors: BoundingBox[], trackAnchors: BoundingBox[], frameWidth: number, frameHeight: number, minSidePx: number): BoundingBox[] | null {
    this.last = undefined;
    this.paid = undefined;
    this.tick++;

    const padded = [...motionAnchors.map((box) => padBox(box, MOTION_PAD)), ...trackAnchors.map((box) => padBox(box, TRACK_PAD))];
    if (padded.length === 0) {
      this.clusters = [];
      this.last = { mode: 'full', windows: [], motion: motionAnchors, tracks: trackAnchors, reason: 'no-anchors', ...this.payDebt(), pending: 0 };
      return null;
    }

    const covers = clusterBoxes(padded);
    const previous = this.clusters;
    this.clusters = covers.map((box) => {
      const match = previous.reduce<{ cluster?: Cluster; score: number }>(
        (best, cluster) => {
          const score = iou(cluster.box, box);
          return score > best.score ? { cluster, score } : best;
        },
        { score: 0 },
      ).cluster;
      return { box, lastServed: match?.lastServed ?? 0, window: match?.window, shrink: match?.shrink ?? 0, looks: match?.looks ?? 0 };
    });

    // raw boxes, padding would merge a newcomer into the person next to it
    const fresh = new Set<Cluster>();
    for (const anchor of motionAnchors) {
      if (trackAnchors.some((track) => overlaps(anchor, track))) continue;
      const grown = padBox(anchor, MOTION_PAD);
      const cluster = this.clusters.find((candidate) => overlaps(candidate.box, grown));
      if (cluster) fresh.add(cluster);
    }
    const pending = [...fresh].filter((cluster) => cluster.looks < LOOKS_BEFORE_FULL).length;

    // a sweep tick neither serves nor re-centres a window
    if (this.owed && (pending === 0 || this.owed.plans >= DEBT_PATIENCE)) {
      this.last = { mode: 'sweep', windows: [], motion: motionAnchors, tracks: trackAnchors, reason: this.owed.reason, ...this.payDebt(), pending };
      return null;
    }

    const served =
      this.clusters.length <= WINDOW_CAP
        ? this.clusters
        : [...this.clusters].sort((a, b) => a.lastServed - b.lastServed || b.box.width * b.box.height - a.box.width * a.box.height).slice(0, WINDOW_CAP);

    const windows: BoundingBox[] = [];
    for (const cluster of served) {
      cluster.lastServed = this.tick;
      const window = this.applyHysteresis(cluster, frameWidth, frameHeight, minSidePx);
      if (!window) {
        this.last = { mode: 'full', windows: [], motion: motionAnchors, tracks: trackAnchors, reason: 'cover', ...this.payDebt(), pending };
        return null;
      }
      // nothing a window outside every object zone sees passes the zone filter
      if (!this.watches(window)) continue;
      // clusters split from one keep its window, one look covers them all
      if (!windows.some((other) => sameBox(other, window))) windows.push(window);
    }

    for (const cluster of served) cluster.looks++;
    if (windows.length === 0) {
      this.last = { mode: 'full', windows: [], motion: motionAnchors, tracks: trackAnchors, reason: 'outside-zones', ...this.payDebt(), pending };
      return null;
    }
    if (this.owed) this.owed.plans++;
    this.last = { mode: 'window', windows, motion: motionAnchors, tracks: trackAnchors, pending };
    return windows;
  }

  public oweLook(reason: LookReason): void {
    this.owed ??= { reason, plans: 0 };
  }

  public lookFailed(): void {
    if (this.paid) this.owed = this.paid;
    this.paid = undefined;
  }

  public takePlan(): PlanRecord | undefined {
    const plan = this.last;
    this.last = undefined;
    return plan;
  }

  public reset(): void {
    this.clusters = [];
    this.oweLook('reset');
  }

  public setZones(zones: Point[][]): void {
    this.zones = zones;
  }

  private payDebt(): Pick<PlanRecord, 'debt' | 'waited'> {
    this.paid = this.owed;
    this.owed = undefined;
    return this.paid ? { debt: this.paid.reason, waited: this.paid.plans } : {};
  }

  private watches(window: BoundingBox): boolean {
    return this.zones.length === 0 || this.zones.some((zone) => boxIntersectsPolygon(window, zone));
  }

  private applyHysteresis(cluster: Cluster, frameWidth: number, frameHeight: number, minSidePx: number): BoundingBox | null {
    const target = squareWindow(cluster.box, frameWidth, frameHeight, minSidePx);
    if (!target) return null;

    const current = cluster.window;
    if (!current || !contains(current, cluster.box)) {
      cluster.window = target;
      cluster.shrink = 0;
    } else if (target.width < current.width * 0.6) {
      cluster.shrink++;
      if (cluster.shrink >= SHRINK_PATIENCE) {
        cluster.window = target;
        cluster.shrink = 0;
      }
    } else {
      cluster.shrink = 0;
    }

    return cluster.window ?? target;
  }
}
