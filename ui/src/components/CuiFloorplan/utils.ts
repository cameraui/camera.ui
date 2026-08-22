import { FLOORPLAN_UNITS_PER_METER } from './types.js';

import type { FloorplanConnection, FloorplanRoom } from './types.js';

export function toMeters(units: number): number {
  return units / FLOORPLAN_UNITS_PER_METER;
}

export function metersLabel(units: number, digits = 2): string {
  return `${toMeters(units).toFixed(digits)} m`;
}

export type ConnectionGeometry =
  | { kind: 'edge'; x1: number; y1: number; x2: number; y2: number; wall: Wall }
  | { kind: 'link'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'badge'; roomId: string; shapeId: string };

export interface Wall {
  x: number;
  y: number;
  stepX: number;
  stepY: number;
  length: number;
}

function center(room: FloorplanRoom): { x: number; y: number } {
  return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
}

export function sharedWall(a: FloorplanRoom, b: FloorplanRoom): Wall | null {
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);

  if (overlapY > 0 && (a.x + a.width === b.x || b.x + b.width === a.x)) {
    const x = a.x + a.width === b.x ? b.x : a.x;
    return { x, y: Math.max(a.y, b.y), stepX: 0, stepY: 1, length: overlapY };
  }

  if (overlapX > 0 && (a.y + a.height === b.y || b.y + b.height === a.y)) {
    const y = a.y + a.height === b.y ? b.y : a.y;
    return { x: Math.max(a.x, b.x), y, stepX: 1, stepY: 0, length: overlapX };
  }

  return null;
}

export function passageOn(wall: Wall, offset: number | null, width: number): { x1: number; y1: number; x2: number; y2: number } {
  const span = Math.min(width, wall.length);
  const half = span / 2;
  const at = Math.min(Math.max(offset ?? wall.length / 2, half), wall.length - half);

  return {
    x1: wall.x + wall.stepX * (at - half),
    y1: wall.y + wall.stepY * (at - half),
    x2: wall.x + wall.stepX * (at + half),
    y2: wall.y + wall.stepY * (at + half),
  };
}

export function connectionGeometry(connection: FloorplanConnection, rooms: FloorplanRoom[], levelId: string): ConnectionGeometry | null {
  const fromParts = rooms.filter((room) => room.roomId === connection.fromRoomId);
  const toParts = rooms.filter((room) => room.roomId === connection.toRoomId);
  if (!fromParts.length || !toParts.length) return null;

  const fromVisible = fromParts.some((room) => room.levelId === levelId);
  const toVisible = toParts.some((room) => room.levelId === levelId);
  if (!fromVisible && !toVisible) return null;

  if (fromVisible !== toVisible) {
    const side = fromVisible ? connection.fromShapeId : connection.toShapeId;
    const parts = fromVisible ? fromParts : toParts;
    return { kind: 'badge', roomId: fromVisible ? connection.fromRoomId : connection.toRoomId, shapeId: parts.find((room) => room.id === side)?.id ?? parts[0].id };
  }

  const preferredFrom = fromParts.find((room) => room.id === connection.fromShapeId);
  const preferredTo = toParts.find((room) => room.id === connection.toShapeId);

  const pairs = preferredFrom && preferredTo ? [[preferredFrom, preferredTo] as const] : fromParts.flatMap((from) => toParts.map((to) => [from, to] as const));

  for (const [from, to] of pairs) {
    const wall = sharedWall(from, to);
    if (wall) return { kind: 'edge', ...passageOn(wall, connection.offset, connection.width), wall };
  }

  const a = center(fromParts[0]);
  const b = center(toParts[0]);
  return { kind: 'link', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

interface Corner {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoomOutline {
  fill: string;
  wall: string;
}

export function roomOutline(parts: FloorplanRoom[], radius: number, gaps: Segment[]): RoomOutline {
  const loops = unionLoops(parts);
  return {
    fill: loops.map((loop) => traceLoop(loop, radius, [])).join(' '),
    wall: loops.map((loop) => traceLoop(loop, radius, gaps)).join(' '),
  };
}

function unionLoops(parts: FloorplanRoom[]): Corner[][] {
  if (!parts.length) return [];

  const xs = [...new Set(parts.flatMap((part) => [part.x, part.x + part.width]))].sort((a, b) => a - b);
  const ys = [...new Set(parts.flatMap((part) => [part.y, part.y + part.height]))].sort((a, b) => a - b);

  const covered = (column: number, row: number): boolean => {
    if (column < 0 || row < 0 || column >= xs.length - 1 || row >= ys.length - 1) return false;
    const x = (xs[column] + xs[column + 1]) / 2;
    const y = (ys[row] + ys[row + 1]) / 2;
    return parts.some((part) => x > part.x && x < part.x + part.width && y > part.y && y < part.y + part.height);
  };

  const key = (point: Corner): string => `${point.x},${point.y}`;
  const steps = new Map<string, Corner>();

  for (let column = 0; column < xs.length - 1; column++) {
    for (let row = 0; row < ys.length - 1; row++) {
      if (!covered(column, row)) continue;

      const left = xs[column];
      const right = xs[column + 1];
      const top = ys[row];
      const bottom = ys[row + 1];

      if (!covered(column, row - 1)) steps.set(key({ x: left, y: top }), { x: right, y: top });
      if (!covered(column + 1, row)) steps.set(key({ x: right, y: top }), { x: right, y: bottom });
      if (!covered(column, row + 1)) steps.set(key({ x: right, y: bottom }), { x: left, y: bottom });
      if (!covered(column - 1, row)) steps.set(key({ x: left, y: bottom }), { x: left, y: top });
    }
  }

  const loops: Corner[][] = [];
  while (steps.size) {
    const [start] = steps.keys();
    const loop: Corner[] = [];
    let at: Corner | undefined = { x: Number(start.split(',')[0]), y: Number(start.split(',')[1]) };

    while (at) {
      const next: Corner | undefined = steps.get(key(at));
      if (!next) break;
      steps.delete(key(at));
      loop.push(at);
      at = steps.has(key(next)) ? next : undefined;
    }

    if (loop.length > 2) loops.push(dropCollinear(loop));
  }

  return loops;
}

function dropCollinear(loop: Corner[]): Corner[] {
  return loop.filter((corner, index) => {
    const before = loop[(index - 1 + loop.length) % loop.length];
    const after = loop[(index + 1) % loop.length];
    return (before.x !== corner.x || after.x !== corner.x) && (before.y !== corner.y || after.y !== corner.y);
  });
}

function traceLoop(loop: Corner[], radius: number, gaps: Segment[]): string {
  const enter: Corner[] = [];
  const leave: Corner[] = [];
  const bends: number[] = [];

  for (let index = 0; index < loop.length; index++) {
    const corner = loop[index];
    const before = loop[(index - 1 + loop.length) % loop.length];
    const after = loop[(index + 1) % loop.length];

    const incoming = span(before, corner);
    const outgoing = span(corner, after);
    const bend = Math.min(radius, incoming / 2, outgoing / 2);

    enter.push({ x: corner.x + ((before.x - corner.x) / incoming) * bend, y: corner.y + ((before.y - corner.y) / incoming) * bend });
    leave.push({ x: corner.x + ((after.x - corner.x) / outgoing) * bend, y: corner.y + ((after.y - corner.y) / outgoing) * bend });
    bends.push(bend);
  }

  const closed = gaps.length === 0;
  const parts: string[] = [];
  let attached = false;

  for (let index = 0; index < loop.length; index++) {
    const next = (index + 1) % loop.length;

    for (const run of visibleRuns(leave[index], enter[next], gaps)) {
      if (!attached || !closed) parts.push(`M ${round(run.x1)} ${round(run.y1)}`);
      parts.push(`L ${round(run.x2)} ${round(run.y2)}`);
      attached = true;
    }

    if (bends[next] > 0) {
      const after = loop[(next + 1) % loop.length];
      const cross = (loop[next].x - loop[index].x) * (after.y - loop[next].y) - (loop[next].y - loop[index].y) * (after.x - loop[next].x);
      if (!attached) parts.push(`M ${round(enter[next].x)} ${round(enter[next].y)}`);
      parts.push(`A ${round(bends[next])} ${round(bends[next])} 0 0 ${cross > 0 ? 1 : 0} ${round(leave[next].x)} ${round(leave[next].y)}`);
      attached = true;
    }
  }

  return closed ? `${parts.join(' ')} Z` : parts.join(' ');
}

function visibleRuns(from: Corner, to: Corner, gaps: Segment[]): Segment[] {
  const total = span(from, to);
  if (total === 0) return [];

  const stepX = (to.x - from.x) / total;
  const stepY = (to.y - from.y) / total;
  const at = (value: number): Corner => ({ x: from.x + stepX * value, y: from.y + stepY * value });
  const along = (point: Corner): number => (point.x - from.x) * stepX + (point.y - from.y) * stepY;

  const holes: { start: number; end: number }[] = [];
  for (const gap of gaps) {
    const vertical = from.x === to.x && gap.x1 === gap.x2 && Math.abs(gap.x1 - from.x) < 1;
    const horizontal = from.y === to.y && gap.y1 === gap.y2 && Math.abs(gap.y1 - from.y) < 1;
    if (!vertical && !horizontal) continue;

    const a = along({ x: gap.x1, y: gap.y1 });
    const b = along({ x: gap.x2, y: gap.y2 });
    const start = Math.max(0, Math.min(a, b));
    const end = Math.min(total, Math.max(a, b));
    if (end > start) holes.push({ start, end });
  }

  holes.sort((a, b) => a.start - b.start);

  const runs: Segment[] = [];
  let cursor = 0;
  for (const hole of holes) {
    if (hole.start > cursor) {
      const head = at(cursor);
      const tail = at(hole.start);
      runs.push({ x1: head.x, y1: head.y, x2: tail.x, y2: tail.y });
    }
    cursor = Math.max(cursor, hole.end);
  }
  if (cursor < total) {
    const head = at(cursor);
    const tail = at(total);
    runs.push({ x1: head.x, y1: head.y, x2: tail.x, y2: tail.y });
  }

  return runs;
}

function span(from: Corner, to: Corner): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
