import type { BoundingBox, Detection } from '@camera.ui/sdk';

export const WINDOW_CAP = 3;
export const MOTION_PAD = 1.5;
export const TRACK_PAD = 1.25;
const SHRINK_PATIENCE = 5;
const FULL_FRAME_FRACTION = 0.98;
const SWEEP_EVERY = 10;

interface Cluster {
  box: BoundingBox;
  lastServed: number;
  window?: BoundingBox;
  shrink: number;
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

export function mergeWindowDetections(detections: Detection[]): Detection[] {
  const kept: Detection[] = [];
  for (const detection of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    const duplicate = kept.some((other) => {
      if (other.label !== detection.label || other.box === undefined || detection.box === undefined) return false;
      if (iou(other.box, detection.box) >= 0.5) return true;
      // containment dedups the same object across window seams, where both
      // boxes are alike in size; a small object inside a huge same-label box
      // (a passing car in front of a parked column read as one vehicle) is a
      // distinct object, not a duplicate
      const areaA = other.box.width * other.box.height;
      const areaB = detection.box.width * detection.box.height;
      const sizeAlike = Math.min(areaA, areaB) >= Math.max(areaA, areaB) * 0.25;
      return sizeAlike && containment(other.box, detection.box) >= 0.7;
    });
    if (!duplicate) kept.push(detection);
  }
  return kept;
}

export function contains(outer: BoundingBox, inner: BoundingBox): boolean {
  return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
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
  private windowedTicks = 0;

  // null = analyse the full frame (no anchors, a cover swallowed the frame, or
  // the periodic sweep against motion under-reporters)
  public plan(motionAnchors: BoundingBox[], trackAnchors: BoundingBox[], frameWidth: number, frameHeight: number, minSidePx: number): BoundingBox[] | null {
    this.tick++;

    const padded = [...motionAnchors.map((box) => padBox(box, MOTION_PAD)), ...trackAnchors.map((box) => padBox(box, TRACK_PAD))];
    if (padded.length === 0) {
      this.clusters = [];
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
      return { box, lastServed: match?.lastServed ?? 0, window: match?.window, shrink: match?.shrink ?? 0 };
    });

    this.windowedTicks++;
    if (this.windowedTicks % SWEEP_EVERY === 0) return null;

    const served =
      this.clusters.length <= WINDOW_CAP
        ? this.clusters
        : [...this.clusters].sort((a, b) => a.lastServed - b.lastServed || b.box.width * b.box.height - a.box.width * a.box.height).slice(0, WINDOW_CAP);

    const windows: BoundingBox[] = [];
    for (const cluster of served) {
      cluster.lastServed = this.tick;
      const window = this.applyHysteresis(cluster, frameWidth, frameHeight, minSidePx);
      if (!window) return null;
      windows.push(window);
    }

    return windows;
  }

  public reset(): void {
    this.clusters = [];
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
