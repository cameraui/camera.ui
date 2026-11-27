import { HOME_BREAKPOINTS } from '@shared/types';

import type { SensorTileSize } from '@/components/CuiSensorTile/types.js';
import type { DBHomeBreakpoint, DBHomeProfile, DBHomeProfileRule, DBHomeWidget, DBHomeWidgetKind, DBHomeWidgetPosition } from '@shared/types';
import type { HomeArrangeItem, HomeCellPosition, HomeCellSize, HomePlacement, HomeSize, HomeSizeLabel, HomeSizeOption, HomeSizeRange, HomeWidgetSpec } from './types.js';

type HomeLayout = Map<string, DBHomeWidgetPosition>;
type HomeHomes = Map<string, HomeCellPosition>;

export const HOME_COLUMNS: Record<DBHomeBreakpoint, number> = { xl: 16, lg: 12, md: 8, sm: 4 };

const MIN_WIDTH: Record<DBHomeBreakpoint, number> = { xl: 1500, lg: 1000, md: 600, sm: 0 };
const MAX_CELL = 144;

const TILE_SIZES = {
  mini: sized('mini', [1, 1]),
  row2: sized('row', [2, 1]),
  row3: sized('row', [3, 1]),
  row4: sized('row', [4, 1]),
  tile: sized('tile', [2, 2]),
  flat3: sized('widget', [3, 2]),
  flat4: sized('widget', [4, 2]),
  widget: sized('widget', [3, 3]),
  wide: sized('widget', [4, 3]),
  large: sized('large', [4, 4]),
};

const TILE_RANGE: HomeSizeRange = { w: [1, 4], h: [1, 4] };

const CAMERA_WIDTHS = {
  small: { xl: 3, lg: 3, md: 3, sm: 2 },
  medium: { xl: 4, lg: 4, md: 4, sm: 3 },
  large: { xl: 8, lg: 6, md: 6, sm: 4 },
  full: { xl: 16, lg: 12, md: 8, sm: 4 },
} satisfies Record<string, Record<DBHomeBreakpoint, number>>;

const CAMERA_MAX_ROWS = 10;

export const HOME_SPECS = {
  notes: {
    initial: 'medium',
    sizes: { small: sized('small', [4, 2]), medium: sized('medium', [4, 3]), large: sized('large', [6, 4], [8, 4], [4, 4]) },
    range: { w: [2, HOME_COLUMNS.xl], h: [1, 8] },
  },
  events: {
    initial: 'largeTall',
    sizes: {
      small: sized('small', [4, 2]),
      medium: sized('medium', [6, 2], [6, 2], [4, 2]),
      large: sized('large', [8, 2], [8, 2], [4, 2]),
      full: sized('full', [12, 2], [8, 2], [4, 2], [16, 2]),
      smallTall: sized('small', [4, 3]),
      mediumTall: sized('medium', [6, 3], [6, 3], [4, 3]),
      largeTall: sized('large', [8, 3], [8, 3], [4, 3]),
      fullTall: sized('full', [12, 3], [8, 3], [4, 3], [16, 3]),
    },
    range: { w: [2, HOME_COLUMNS.xl], h: [2, 3] },
  },
  smallTile: { initial: 'row2', sizes: TILE_SIZES, range: TILE_RANGE },
  mediumTile: { initial: 'tile', sizes: TILE_SIZES, range: TILE_RANGE },
  lights: {
    initial: 'tile',
    sizes: { row2: TILE_SIZES.row2, tile: TILE_SIZES.tile, flat3: TILE_SIZES.flat3, flat4: TILE_SIZES.flat4, widget: TILE_SIZES.widget, wide: TILE_SIZES.wide },
    range: { w: [2, 4], h: [1, 4] },
  },
  group: {
    initial: 'flat4',
    sizes: { tile: TILE_SIZES.tile, flat3: TILE_SIZES.flat3, flat4: TILE_SIZES.flat4, widget: TILE_SIZES.widget, wide: TILE_SIZES.wide, large: TILE_SIZES.large },
    range: { w: [2, 8], h: [2, 6] },
  },
  automation: { initial: 'row2', sizes: { row2: TILE_SIZES.row2, row3: TILE_SIZES.row3, tile: TILE_SIZES.tile, flat3: TILE_SIZES.flat3 } },
  clock: {
    initial: 'tile',
    sizes: { row2: TILE_SIZES.row2, tile: TILE_SIZES.tile, flat4: TILE_SIZES.flat4, wide: TILE_SIZES.wide, broad: sized('widget', [6, 3], [6, 3], [4, 3]) },
    range: { w: [2, 6], h: [1, 3] },
  },
  action: {
    initial: 'row2',
    sizes: { row2: TILE_SIZES.row2, row3: TILE_SIZES.row3, tile: TILE_SIZES.tile, flat3: TILE_SIZES.flat3, flat4: TILE_SIZES.flat4 },
    range: { w: [2, 4], h: [1, 2] },
  },
  actionGroup: {
    initial: 'flat4',
    sizes: { tile: TILE_SIZES.tile, flat3: TILE_SIZES.flat3, flat4: TILE_SIZES.flat4, wide: TILE_SIZES.wide, broad: sized('widget', [6, 3], [6, 3], [4, 4]) },
    range: { w: [2, 6], h: [2, 4] },
  },
  floorplan: {
    initial: 'large',
    sizes: {
      medium: sized('medium', [6, 4], [6, 4], [4, 3]),
      large: sized('large', [8, 5], [8, 5], [4, 4]),
      full: sized('full', [12, 7], [8, 5], [4, 4], [16, 9]),
    },
    range: { w: [3, HOME_COLUMNS.xl], h: [2, 12] },
  },
} satisfies Record<string, HomeWidgetSpec>;

export function cameraSpec(aspectRatio = '16:9'): HomeWidgetSpec {
  const [width, height] = aspectRatio.split(':').map(Number);
  const ratio = width && height ? width / height : 16 / 9;
  const sizes: Record<string, HomeSize> = {};
  for (const [name, widths] of Object.entries(CAMERA_WIDTHS)) {
    const cells = {} as HomeSize['cells'];
    for (const bp of HOME_BREAKPOINTS) {
      const h = Math.min(Math.max(1, Math.round(widths[bp] / ratio)), CAMERA_MAX_ROWS);
      cells[bp] = { w: Math.min(widths[bp], Math.max(1, Math.round(h * ratio))), h };
    }
    sizes[name] = { label: name as HomeSizeLabel, cells };
  }
  return { initial: 'large', sizes, range: { w: [2, HOME_COLUMNS.xl], h: [2, 16] } };
}

export function skeletonLayout(cols: number, rows: number): DBHomeWidgetPosition[] {
  const positions: DBHomeWidgetPosition[] = [];
  const big = Math.min(4, cols);
  // a row of camera blocks and two rows of small tiles take turns, like a page that has both
  for (let y = 0, band = 0; y < rows; band++) {
    const [w, h, lines] = band % 2 ? [2, 1, 2] : [big, 3, 1];
    for (let line = 0; line < lines; line++, y += h) {
      for (let x = 0; x + w <= cols; x += w) positions.push({ x, y, w, h });
    }
  }
  return positions.filter((position) => position.y < rows);
}

export function initialSize(spec: HomeWidgetSpec, bp: DBHomeBreakpoint): HomeCellSize {
  return spec.sizes[spec.initial]!.cells[bp];
}

export function homeBreakpoint(width: number): DBHomeBreakpoint {
  return HOME_BREAKPOINTS.find((bp) => width >= MIN_WIDTH[bp]) ?? 'sm';
}

export function homeGap(bp: DBHomeBreakpoint): number {
  return bp === 'sm' ? 12 : 16;
}

export function homeMaxWidth(bp: DBHomeBreakpoint): number {
  return HOME_COLUMNS[bp] * (MAX_CELL + homeGap(bp)) - homeGap(bp);
}

export function matchingProfile(profiles: DBHomeProfile[], width: number, height: number): DBHomeProfile | undefined {
  return profiles.slice(1).find((profile) => profile.rule && fits(profile.rule, width, height)) ?? profiles[0];
}

export function tileSizeFor({ w, h }: HomeCellSize): SensorTileSize {
  if (w === 1) return 'mini';
  if (h === 1) return 'small';
  if (w >= 4 && h >= 4) return 'large';
  return w === 2 && h === 2 ? 'medium' : 'widget';
}

export function sizeOptions(spec: HomeWidgetSpec, bp: DBHomeBreakpoint): HomeSizeOption[] {
  const options: HomeSizeOption[] = [];
  for (const [name, { label, cells }] of Object.entries(spec.sizes)) {
    const size = cells[bp];
    // sizes that look the same at this width are offered once
    if (!options.some((option) => option.size.w === size.w && option.size.h === size.h)) options.push({ name, label, size });
  }
  return options;
}

export function nearestSize(options: HomeSizeOption[], { w, h }: HomeCellSize): HomeSizeOption {
  const distance = ({ size }: HomeSizeOption) => Math.abs(size.w - w) + Math.abs(size.h - h);
  return options.reduce((best, option) => (distance(option) < distance(best) ? option : best));
}

export function fitRange({ w, h }: HomeCellSize, range: HomeSizeRange): HomeCellSize {
  return { w: Math.min(Math.max(w, range.w[0]), range.w[1]), h: Math.min(Math.max(h, range.h[0]), range.h[1]) };
}

export function placeWidgets(entries: HomePlacement[], size: DBHomeBreakpoint | undefined, bp: DBHomeBreakpoint): Map<string, DBHomeWidgetPosition> {
  const placed = new Map<string, DBHomeWidgetPosition>();
  const loose: HomePlacement[] = [];
  for (const entry of entries) {
    const stored = size === bp ? entry.widget.layout : undefined;
    if (stored) placed.set(entry.widget.id, stored);
    else loose.push(entry);
  }
  for (const entry of readingOrder(loose)) placed.set(entry.widget.id, freeSpot(placed.values(), sizeAt(entry, size, bp), HOME_COLUMNS[bp]));

  return placed;
}

export function freeSpot(taken: Iterable<DBHomeWidgetPosition>, { w, h }: HomeCellSize, cols: number): DBHomeWidgetPosition {
  const cells = new Set<string>();
  for (const position of taken) {
    for (let y = position.y; y < position.y + position.h; y++) {
      for (let x = position.x; x < position.x + position.w; x++) cells.add(`${x}:${y}`);
    }
  }

  const free = (x: number, y: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) if (cells.has(`${x + dx}:${y + dy}`)) return false;
    }
    return true;
  };

  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= cols; x++) if (free(x, y)) return { x, y, w, h };
  }
}

const ARRANGE_RANK: Record<DBHomeWidgetKind, number> = {
  clock: 0,
  notes: 0,
  camera: 1,
  floorplan: 2,
  events: 3,
  lights: 4,
  group: 4,
  action: 5,
  automation: 5,
  sensor: 6,
};

const WIDENS = new Set<DBHomeWidgetKind>(['sensor', 'lights', 'group', 'automation', 'action', 'floorplan']);

export function arrangeWidgets(items: HomeArrangeItem[], cols: number): Map<string, DBHomeWidgetPosition> {
  const ordered = [...items].sort((a, b) => ARRANGE_RANK[a.kind] - ARRANGE_RANK[b.kind] || b.w * b.h - a.w * a.h || b.h - a.h || a.y - b.y || a.x - b.x);
  const placed = new Map<string, DBHomeWidgetPosition>();
  for (const item of ordered) placed.set(item.id, freeSpot(placed.values(), { w: Math.min(item.w, cols), h: item.h }, cols));

  for (const item of ordered) {
    const spot = placed.get(item.id)!;
    const widest = Math.min(item.range?.w[1] ?? spot.w, cols);
    if (!WIDENS.has(item.kind)) continue;
    while (spot.w < widest && spot.x + spot.w < cols && isFree(placed, { ...spot, x: spot.x + spot.w, w: 1 })) spot.w++;
  }

  for (const spot of [...placed.values()].sort((a, b) => a.y - b.y || a.x - b.x)) {
    while (spot.y > 0 && isFree(placed, { ...spot, y: spot.y - 1, h: 1 }, spot)) spot.y--;
  }
  return placed;
}

export function settleLayout(before: HomeLayout, id: string, spot: DBHomeWidgetPosition, cols: number, homes: HomeHomes = new Map()): HomeLayout {
  const old = before.get(id);
  const layout = copyLayout(before);
  layout.delete(id);
  const target = { ...spot, x: Math.max(0, Math.min(spot.x, cols - spot.w)) };
  // a resize that no longer fits at its column shifts left, that is no move and swaps with nothing
  const moved = old !== undefined && old.w === target.w && old.h === target.h && (old.x !== target.x || old.y !== target.y);
  // a nudge into a neighbour slides back, anywhere else a moved widget stays where it was put
  const put = moved && !(overlaps(old, target) && [...layout.values()].some((position) => overlaps(position, target)));
  const counted = new Set<string>();

  if (moved) {
    // dropped onto one of its size it takes that place, a touching neighbour swaps with it
    const [hitId, hit] = landedOn(layout, target) ?? [];
    const twin = hit && hit.w === target.w && hit.h === target.h ? hit : undefined;
    if (twin) Object.assign(target, { x: twin.x, y: twin.y });
    if (hitId && twin && touching(twin, old)) layout.set(hitId, { ...twin, x: old.x, y: old.y });
    else if (!overlaps(old, target)) {
      rise(layout, cellsOf(before.values()));
      // what moved up into the old place from above the drop point stays in front of the widget
      for (const [key, position] of layout) if (position.y !== before.get(key)!.y && before.get(key)!.y <= target.y) counted.add(key);
    }
  }

  let shifted = true;
  while (shifted) {
    shifted = false;
    for (const [key, position] of layout) {
      if (!counted.has(key) || !overlaps(position, target)) continue;
      target.y = position.y + position.h;
      shifted = true;
    }
  }

  const taken = [target];
  for (const position of [...layout.values()].sort(byRow)) {
    while (taken.some((other) => overlaps(other, position))) position.y++;
    taken.push(position);
  }
  layout.set(id, target);
  const putAt = put ? { id, wasTaken: cellsOf([...before].filter(([key]) => key !== id).map(([, position]) => position)) } : undefined;
  // nothing leaves a hole behind, gaps that were there before stay
  rise(layout, cellsOf(before.values()), put ? new Map(homes).set(id, { x: target.x, y: target.y }) : homes, putAt);
  return layout;
}

export function updateHomes(homes: HomeHomes, layout: HomeLayout, active?: string): void {
  for (const id of homes.keys()) if (!layout.has(id)) homes.delete(id);
  for (const [id, { x, y }] of layout) {
    const home = homes.get(id);
    // a home is where the widget was put or moved up to, one pushed down by a bigger neighbour keeps it and goes back once there is room
    if (!home || id === active || home.x !== x || y <= home.y) homes.set(id, { x, y });
  }
}

export function closeGap(placed: HomeLayout, id: string): HomeLayout {
  const layout = copyLayout(placed);
  layout.delete(id);
  rise(layout, cellsOf(placed.values()));
  return layout;
}

export function byPosition(widgets: DBHomeWidget[], placed: Map<string, DBHomeWidgetPosition>): DBHomeWidget[] {
  return [...widgets].sort((a, b) => rank(placed.get(a.id)) - rank(placed.get(b.id)));
}

function fits(rule: DBHomeProfileRule, width: number, height: number): boolean {
  if (rule.orientation && rule.orientation !== (width >= height ? 'landscape' : 'portrait')) return false;
  return width >= (rule.minWidth ?? 0) && width <= (rule.maxWidth ?? Infinity) && height >= (rule.minHeight ?? 0) && height <= (rule.maxHeight ?? Infinity);
}

function isFree(placed: Map<string, DBHomeWidgetPosition>, area: DBHomeWidgetPosition, self?: DBHomeWidgetPosition): boolean {
  return ![...placed.values()].some((other) => other !== self && overlaps(area, other));
}

function readingOrder(entries: HomePlacement[]): HomePlacement[] {
  return [...entries].sort((a, b) => rank(a.widget.layout) - rank(b.widget.layout));
}

function rank(position: DBHomeWidgetPosition | undefined): number {
  return position ? position.y * 100 + position.x : Number.MAX_SAFE_INTEGER;
}

function sizeAt({ widget, spec }: HomePlacement, size: DBHomeBreakpoint | undefined, bp: DBHomeBreakpoint): HomeCellSize {
  const name = widget.layout && size ? nearestSize(sizeOptions(spec, size), widget.layout).name : spec.initial;
  return spec.sizes[name]!.cells[bp];
}

function sized(label: HomeSizeLabel, lg: [number, number], md = lg, sm = md, xl = lg): HomeSize {
  return { label, cells: { xl: { w: xl[0], h: xl[1] }, lg: { w: lg[0], h: lg[1] }, md: { w: md[0], h: md[1] }, sm: { w: sm[0], h: sm[1] } } };
}

function copyLayout(layout: HomeLayout): HomeLayout {
  return new Map([...layout].map(([id, position]) => [id, { ...position }]));
}

function cellsOf(positions: Iterable<DBHomeWidgetPosition>): Set<string> {
  const cells = new Set<string>();
  for (const { x, y, w, h } of positions) {
    for (let row = y; row < y + h; row++) for (let column = x; column < x + w; column++) cells.add(`${column}:${row}`);
  }
  return cells;
}

function rise(layout: HomeLayout, wasTaken: Set<string>, homes: HomeHomes = new Map(), put?: { id: string; wasTaken: Set<string> }): void {
  const taken = cellsOf(layout.values());
  for (const [id, position] of [...layout].sort(([, a], [, b]) => byRow(a, b))) {
    const emptied = id === put?.id ? put.wasTaken : wasTaken;
    const home = homes.get(id);
    const belowHome = home?.x === position.x ? home.y : Infinity;
    while (position.y > 0) {
      const row = position.y - 1;
      const columns = Array.from({ length: position.w }, (_, index) => position.x + index);
      const cells = columns.map((column) => `${column}:${row}`);
      // up into a free row the change emptied part of, or back toward its home, a gap the change did not touch stays
      if (cells.some((cell) => taken.has(cell)) || (row < belowHome && !cells.some((cell) => emptied.has(cell)))) break;
      for (const column of columns) {
        taken.delete(`${column}:${row + position.h}`);
        taken.add(`${column}:${row}`);
      }
      position.y = row;
    }
  }
}

function landedOn(layout: HomeLayout, spot: DBHomeWidgetPosition): [string, DBHomeWidgetPosition] | undefined {
  let best: [string, DBHomeWidgetPosition] | undefined;
  let bestArea = 0;
  for (const entry of layout) {
    const area = overlapArea(entry[1], spot);
    if (area * 2 >= entry[1].w * entry[1].h && area > bestArea) [best, bestArea] = [entry, area];
  }
  return best;
}

function overlapArea(a: DBHomeWidgetPosition, b: DBHomeWidgetPosition): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function overlaps(a: DBHomeWidgetPosition, b: DBHomeWidgetPosition): boolean {
  return overlapArea(a, b) > 0;
}

function touching(a: DBHomeWidgetPosition, b: DBHomeWidgetPosition): boolean {
  const rows = a.y < b.y + b.h && b.y < a.y + a.h;
  const columns = a.x < b.x + b.w && b.x < a.x + a.w;
  return (rows && (a.x + a.w === b.x || b.x + b.w === a.x)) || (columns && (a.y + a.h === b.y || b.y + b.h === a.y));
}

function byRow(a: DBHomeWidgetPosition, b: DBHomeWidgetPosition): number {
  return a.y - b.y || a.x - b.x;
}
