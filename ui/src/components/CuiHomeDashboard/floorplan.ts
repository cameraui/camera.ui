import type { HomePlanRoom } from './types.js';

export interface PlanBox {
  width: number;
  height: number;
}

export interface PlanTile {
  key: string;
  room?: HomePlanRoom;
  more: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PlanCell {
  key: string;
  room?: HomePlanRoom;
  more: number;
  area: number;
}

interface PlanRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 8;
const MIN_WIDTH = 88;
const MIN_HEIGHT = 60;
const FLATTENING = [1, 0.5, 0];

export function planMosaic(rooms: HomePlanRoom[], box: PlanBox): PlanTile[] {
  if (!rooms.length || box.width <= 0 || box.height <= 0) return [];

  const sorted = [...rooms].sort((a, b) => roomWeight(b) - roomWeight(a) || a.name.localeCompare(b.name));
  const fewest = Math.min(2, sorted.length);
  for (let count = sorted.length; count > fewest; count--) {
    for (const power of FLATTENING) {
      const tiles = layout(sorted, count, box, power);
      if (tiles.every((tile) => tile.width >= MIN_WIDTH && tile.height >= MIN_HEIGHT)) return tiles;
    }
  }
  return layout(sorted, fewest, box, 1);
}

function roomWeight(room: HomePlanRoom): number {
  // more devices make a room bigger, slowly; an open door or a camera alert lifts it once more
  return 1 + Math.sqrt(room.devices) + (room.status || room.alert ? 1 : 0);
}

function layout(rooms: HomePlanRoom[], count: number, box: PlanBox, power: number): PlanTile[] {
  const shown = count < rooms.length ? rooms.slice(0, count - 1) : rooms;
  const weights = shown.map((room) => roomWeight(room) ** power);
  if (shown.length < rooms.length) weights.push(weights.at(-1)!);

  // laid out one gap larger, every tile then gives that gap back on its right and bottom edge
  const outer: PlanRect = { x: 0, y: 0, w: box.width + GAP, h: box.height + GAP };
  const scale = (outer.w * outer.h) / weights.reduce((sum, weight) => sum + weight, 0);
  const cells: PlanCell[] = weights.map((weight, index) => {
    const room = shown[index];
    return { key: room?.id ?? 'more', room, more: room ? 0 : rooms.length - shown.length, area: weight * scale };
  });

  return squarify(cells, outer).map(({ cell, rect }) => {
    const left = Math.round(rect.x);
    const top = Math.round(rect.y);
    return {
      key: cell.key,
      room: cell.room,
      more: cell.more,
      left,
      top,
      width: Math.round(rect.x + rect.w) - left - GAP,
      height: Math.round(rect.y + rect.h) - top - GAP,
    };
  });
}

function squarify(cells: PlanCell[], box: PlanRect): { cell: PlanCell; rect: PlanRect }[] {
  const placed: { cell: PlanCell; rect: PlanRect }[] = [];
  let free = box;
  let rest = cells;

  while (rest.length) {
    // a strip along the shorter side takes cells as long as that keeps its tiles closer to square
    const side = Math.min(free.w, free.h);
    let size = 1;
    while (size < rest.length && worstRatio(rest.slice(0, size + 1), side) <= worstRatio(rest.slice(0, size), side)) size++;
    const strip = rest.slice(0, size);
    rest = rest.slice(size);

    const standing = free.w >= free.h;
    const thickness = strip.reduce((sum, cell) => sum + cell.area, 0) / (standing ? free.h : free.w);
    let offset = 0;
    for (const cell of strip) {
      const length = cell.area / thickness;
      const rect = standing ? { x: free.x, y: free.y + offset, w: thickness, h: length } : { x: free.x + offset, y: free.y, w: length, h: thickness };
      placed.push({ cell, rect });
      offset += length;
    }
    free = standing ? { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h } : { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness };
  }
  return placed;
}

function worstRatio(strip: PlanCell[], side: number): number {
  const areas = strip.map((cell) => cell.area);
  const total = areas.reduce((sum, area) => sum + area, 0);
  return Math.max((side * side * Math.max(...areas)) / (total * total), (total * total) / (side * side * Math.min(...areas)));
}
