import type { BoundingBox, Point, ZoneType } from '@camera.ui/sdk';

type Vec = [number, number];

function toUnit(points: Point[]): Vec[] {
  return points.map(([x, y]) => [x / 100, y / 100]);
}

export function pointInPolygon(point: Vec, polygon: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const aboveI = yi > point[1];
    const aboveJ = yj > point[1];
    const crosses = aboveI !== aboveJ && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(a: Vec, b: Vec, c: Vec): number {
  return Math.sign((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]));
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

function boxCorners(box: BoundingBox): Vec[] {
  return [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ];
}

export function boxInsidePolygon(box: BoundingBox, points: Point[]): boolean {
  const polygon = toUnit(points);
  return boxCorners(box).every((corner) => pointInPolygon(corner, polygon));
}

export function boxIntersectsPolygon(box: BoundingBox, points: Point[]): boolean {
  const polygon = toUnit(points);
  const corners = boxCorners(box);
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  if (polygon.some(([x, y]) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)) return true;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsIntersect(a, b, polygon[j], polygon[(j + 1) % polygon.length])) return true;
    }
  }
  return false;
}

export function boxAnchorInPolygon(box: BoundingBox, points: Point[]): boolean {
  return pointInPolygon([box.x + box.width / 2, box.y + box.height], toUnit(points));
}

export function boxMatchesZone(box: BoundingBox, points: Point[], type: ZoneType | 'anchor'): boolean {
  if (points.length < 3) return false;
  switch (type) {
    case 'contain':
      return boxInsidePolygon(box, points);
    case 'anchor':
      return boxAnchorInPolygon(box, points);
    default:
      return boxIntersectsPolygon(box, points);
  }
}
