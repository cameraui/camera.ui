import type { BoundingBox, DetectionZone, Point } from '@camera.ui/sdk';

export interface NormalizedZone extends Omit<DetectionZone, 'points'> {
  points: Point[];
}

function pointsEqual(p1: Point, p2: Point): boolean {
  return p1[0] === p2[0] && p1[1] === p2[1];
}

// Normalize a zone's polygon from [0, 100] UI space to [0, 1] and ensure the polygon is closed.
export function normalizeZone(zone: DetectionZone): NormalizedZone {
  const points: Point[] = zone.points.map(([x, y]) => [x / 100, y / 100]);

  if (points.length > 0 && !pointsEqual(points[0], points[points.length - 1])) {
    points.push(points[0]);
  }

  return { ...zone, points };
}

function isPointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    // Edge containment check — if the point lies on (or very near) an
    // edge it counts as inside, even though the strict ray-cast below
    // might miss it depending on which side the cast lands.
    if (px >= Math.min(xi, xj) && px <= Math.max(xi, xj) && py >= Math.min(yi, yj) && py <= Math.max(yi, yj)) {
      if (Math.abs(xi - xj) < 1e-9) {
        if (Math.abs(px - xi) < 1e-9) return true;
      } else {
        const m = (yj - yi) / (xj - xi);
        if (Math.abs(py - (m * px + (yi - m * xi))) < 1e-9) return true;
      }
    }

    // eslint-disable-next-line @stylistic/no-mixed-operators
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function doLinesIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const denom = (b2[1] - b1[1]) * (a2[0] - a1[0]) - (b2[0] - b1[0]) * (a2[1] - a1[1]);
  if (denom === 0) return false;

  const ua = ((b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0])) / denom;
  const ub = ((a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0])) / denom;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function boxCorners(box: BoundingBox): [Point, Point, Point, Point] {
  const x2 = box.x + box.width;
  const y2 = box.y + box.height;
  return [
    [box.x, box.y],
    [x2, box.y],
    [x2, y2],
    [box.x, y2],
  ];
}

// True if the box intersects or is contained within the polygon.
export function boxIntersectsPolygon(box: BoundingBox, polygon: Point[]): boolean {
  const corners = boxCorners(box);
  const x2 = box.x + box.width;
  const y2 = box.y + box.height;

  for (const [cx, cy] of corners) {
    if (isPointInPolygon(cx, cy, polygon)) return true;
  }

  for (const [px, py] of polygon) {
    if (px >= box.x && px <= x2 && py >= box.y && py <= y2) return true;
  }

  const boxEdges: [Point, Point][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  for (let i = 0; i < polygon.length - 1; i++) {
    for (const [ea, eb] of boxEdges) {
      if (doLinesIntersect(ea, eb, polygon[i], polygon[i + 1])) return true;
    }
  }

  return false;
}
