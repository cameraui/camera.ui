import type { CuiCameraCardModels, CuiCameraCardProps } from '@/components/CuiCameraCard/types.js';
import type { DBCamera, DBCamviewLayoutCamera, DBCamviewViewSize } from '@shared/types';

export const SIDEBAR_WIDTH = 400;

export interface DragItem {
  index: number;
  id: string;
  type: string;
}

// gridstack-compatible layout item
export interface GsLayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardState {
  accept: 'camera';
  index: number;
  lastDroppedCamera?: DBCamera;
  colSpan?: number;
  rowSpan?: number;
  x?: number;
  y?: number;
}

export interface ViewDnDCardProps {
  camera?: DBCamera;
  cameras: DBCamera[];
  droppedCameras: DBCamera[];
  mode: 'normal' | 'edit' | 'rearrange';
  index: number;
  cameraCardProps?: Omit<CuiCameraCardProps, 'cameraInfo'>;
  cameraCardModels?: CuiCameraCardModels;
  onDrop?: (camera: DBCamera) => void;
}

export interface ViewDnDCardEmits {
  (e: 'drop', camera: DBCamera): void;
  (e: 'remove', camera: DBCamera): void;
  (e: 'expand', camera: DBCamera, expanded: boolean): void;
}

export interface ViewDnDSidebarProps {
  cameras: DBCamera[];
  droppedCameras: DBCamera[];
  title?: string;
}

export interface ViewDnDSidebarEmits {
  (e: 'changeViewSize'): void;
}

export interface ViewDragProps {
  camera: DBCamera;
  isDropped: boolean;
  canDrag: boolean;
}

export interface CuiCameraViewDnDProps {
  cameras: DBCamera[];
  viewSize?: DBCamviewViewSize;
  cards: CardState[];
  title?: string;
  editMode?: boolean;
  rearrangeMode?: boolean;
  cameraCardProps: Omit<CuiCameraCardProps, 'cameraInfo'>;
  cameraCardModels?: CuiCameraCardModels;
}

export interface CuiCameraViewDnDEmits {
  (e: 'drop', index: number, camera: DBCamera): void;
  (e: 'remove', camera: DBCamera): void;
  (e: 'changeViewSize'): void;
  (e: 'expand', camera: DBCamera, expanded: boolean): void;
  (e: 'rearrange', cameras: DBCamviewLayoutCamera[]): void;
}

type NativeType = null | undefined | number | string | boolean | symbol | ((...args: any[]) => any);
type InferDefault<P, T> = ((props: P) => T & {}) | (T extends NativeType ? T : never);
type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>;
};

export const CUI_CAMERA_VIEW_DND_DEFAULTS: InferDefaults<CuiCameraViewDnDProps> = {
  editMode: false,
  rearrangeMode: false,
  viewSize: 1,
};

// Grid info per viewSize
export interface ViewGridInfo {
  cols: number;
  rows: number;
}

// Scale factor for finer resize granularity. Base layouts are multiplied by this — e.g. GRID_SCALE=2
// means half-cell resize steps. Minimum scale to support exact aspect ratios:
// 16:9 → w:h = 1:1, 8:3 → 3:2, 4:3 → 3:4, 1:1 → 9:16
export const GRID_SCALE = 16;

const BASE_GRID_INFO: Record<number, ViewGridInfo> = {
  1: { cols: 1, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 3 },
  7: { cols: 4, rows: 4 },
  9: { cols: 3, rows: 3 },
  10: { cols: 4, rows: 4 },
  12: { cols: 6, rows: 6 },
  13: { cols: 4, rows: 4 },
  15: { cols: 12, rows: 12 },
  16: { cols: 4, rows: 4 },
  20: { cols: 6, rows: 6 },
  26: { cols: 12, rows: 12 },
};

export const VIEW_GRID_INFO: Record<number, ViewGridInfo> = Object.fromEntries(
  Object.entries(BASE_GRID_INFO).map(([k, v]) => [k, { cols: v.cols * GRID_SCALE, rows: v.rows * GRID_SCALE }]),
);

const scaleLayout = (items: GsLayoutItem[]): GsLayoutItem[] => items.map((i) => ({ x: i.x * GRID_SCALE, y: i.y * GRID_SCALE, w: i.w * GRID_SCALE, h: i.h * GRID_SCALE }));

const BASE_LAYOUTS: Record<number, GsLayoutItem[]> = {
  1: [{ x: 0, y: 0, w: 1, h: 1 }],
  4: [
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 1, y: 0, w: 1, h: 1 },
    { x: 0, y: 1, w: 1, h: 1 },
    { x: 1, y: 1, w: 1, h: 1 },
  ],
  6: [
    { x: 0, y: 0, w: 2, h: 2 },
    { x: 2, y: 0, w: 1, h: 1 },
    { x: 2, y: 1, w: 1, h: 1 },
    { x: 0, y: 2, w: 1, h: 1 },
    { x: 1, y: 2, w: 1, h: 1 },
    { x: 2, y: 2, w: 1, h: 1 },
  ],
  7: [
    { x: 0, y: 0, w: 2, h: 2 },
    { x: 2, y: 0, w: 2, h: 2 },
    { x: 0, y: 2, w: 2, h: 2 },
    { x: 2, y: 2, w: 1, h: 1 },
    { x: 3, y: 2, w: 1, h: 1 },
    { x: 2, y: 3, w: 1, h: 1 },
    { x: 3, y: 3, w: 1, h: 1 },
  ],
  9: [
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 1, y: 0, w: 1, h: 1 },
    { x: 2, y: 0, w: 1, h: 1 },
    { x: 0, y: 1, w: 1, h: 1 },
    { x: 1, y: 1, w: 1, h: 1 },
    { x: 2, y: 1, w: 1, h: 1 },
    { x: 0, y: 2, w: 1, h: 1 },
    { x: 1, y: 2, w: 1, h: 1 },
    { x: 2, y: 2, w: 1, h: 1 },
  ],
  10: [
    { x: 0, y: 0, w: 2, h: 2 },
    { x: 0, y: 2, w: 2, h: 2 },
    { x: 2, y: 0, w: 1, h: 1 },
    { x: 3, y: 0, w: 1, h: 1 },
    { x: 2, y: 1, w: 1, h: 1 },
    { x: 3, y: 1, w: 1, h: 1 },
    { x: 2, y: 2, w: 1, h: 1 },
    { x: 3, y: 2, w: 1, h: 1 },
    { x: 2, y: 3, w: 1, h: 1 },
    { x: 3, y: 3, w: 1, h: 1 },
  ],
  12: [
    { x: 0, y: 0, w: 3, h: 3 },
    { x: 3, y: 0, w: 3, h: 3 },
    { x: 0, y: 3, w: 3, h: 3 },
    { x: 3, y: 3, w: 1, h: 1 },
    { x: 4, y: 3, w: 1, h: 1 },
    { x: 5, y: 3, w: 1, h: 1 },
    { x: 3, y: 4, w: 1, h: 1 },
    { x: 4, y: 4, w: 1, h: 1 },
    { x: 5, y: 4, w: 1, h: 1 },
    { x: 3, y: 5, w: 1, h: 1 },
    { x: 4, y: 5, w: 1, h: 1 },
    { x: 5, y: 5, w: 1, h: 1 },
  ],
  13: [
    { x: 0, y: 0, w: 2, h: 2 },
    { x: 2, y: 0, w: 1, h: 1 },
    { x: 3, y: 0, w: 1, h: 1 },
    { x: 2, y: 1, w: 1, h: 1 },
    { x: 3, y: 1, w: 1, h: 1 },
    { x: 0, y: 2, w: 1, h: 1 },
    { x: 1, y: 2, w: 1, h: 1 },
    { x: 2, y: 2, w: 1, h: 1 },
    { x: 3, y: 2, w: 1, h: 1 },
    { x: 0, y: 3, w: 1, h: 1 },
    { x: 1, y: 3, w: 1, h: 1 },
    { x: 2, y: 3, w: 1, h: 1 },
    { x: 3, y: 3, w: 1, h: 1 },
  ],
  15: [
    { x: 0, y: 0, w: 6, h: 6 },
    { x: 6, y: 0, w: 6, h: 6 },
    { x: 0, y: 6, w: 3, h: 3 },
    { x: 3, y: 6, w: 3, h: 3 },
    { x: 0, y: 9, w: 3, h: 3 },
    { x: 3, y: 9, w: 3, h: 3 },
    { x: 6, y: 6, w: 2, h: 2 },
    { x: 8, y: 6, w: 2, h: 2 },
    { x: 10, y: 6, w: 2, h: 2 },
    { x: 6, y: 8, w: 2, h: 2 },
    { x: 8, y: 8, w: 2, h: 2 },
    { x: 10, y: 8, w: 2, h: 2 },
    { x: 6, y: 10, w: 2, h: 2 },
    { x: 8, y: 10, w: 2, h: 2 },
    { x: 10, y: 10, w: 2, h: 2 },
  ],
  16: [
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 1, y: 0, w: 1, h: 1 },
    { x: 2, y: 0, w: 1, h: 1 },
    { x: 3, y: 0, w: 1, h: 1 },
    { x: 0, y: 1, w: 1, h: 1 },
    { x: 1, y: 1, w: 1, h: 1 },
    { x: 2, y: 1, w: 1, h: 1 },
    { x: 3, y: 1, w: 1, h: 1 },
    { x: 0, y: 2, w: 1, h: 1 },
    { x: 1, y: 2, w: 1, h: 1 },
    { x: 2, y: 2, w: 1, h: 1 },
    { x: 3, y: 2, w: 1, h: 1 },
    { x: 0, y: 3, w: 1, h: 1 },
    { x: 1, y: 3, w: 1, h: 1 },
    { x: 2, y: 3, w: 1, h: 1 },
    { x: 3, y: 3, w: 1, h: 1 },
  ],
  20: [
    { x: 0, y: 0, w: 3, h: 3 },
    { x: 0, y: 3, w: 3, h: 3 },
    { x: 3, y: 0, w: 1, h: 1 },
    { x: 4, y: 0, w: 1, h: 1 },
    { x: 5, y: 0, w: 1, h: 1 },
    { x: 3, y: 1, w: 1, h: 1 },
    { x: 4, y: 1, w: 1, h: 1 },
    { x: 5, y: 1, w: 1, h: 1 },
    { x: 3, y: 2, w: 1, h: 1 },
    { x: 4, y: 2, w: 1, h: 1 },
    { x: 5, y: 2, w: 1, h: 1 },
    { x: 3, y: 3, w: 1, h: 1 },
    { x: 4, y: 3, w: 1, h: 1 },
    { x: 5, y: 3, w: 1, h: 1 },
    { x: 3, y: 4, w: 1, h: 1 },
    { x: 4, y: 4, w: 1, h: 1 },
    { x: 5, y: 4, w: 1, h: 1 },
    { x: 3, y: 5, w: 1, h: 1 },
    { x: 4, y: 5, w: 1, h: 1 },
    { x: 5, y: 5, w: 1, h: 1 },
  ],
  26: [
    { x: 0, y: 0, w: 3, h: 3 },
    { x: 3, y: 0, w: 3, h: 3 },
    { x: 0, y: 3, w: 3, h: 3 },
    { x: 3, y: 3, w: 3, h: 3 },
    { x: 6, y: 0, w: 2, h: 2 },
    { x: 8, y: 0, w: 2, h: 2 },
    { x: 10, y: 0, w: 2, h: 2 },
    { x: 6, y: 2, w: 2, h: 2 },
    { x: 8, y: 2, w: 2, h: 2 },
    { x: 10, y: 2, w: 2, h: 2 },
    { x: 6, y: 4, w: 2, h: 2 },
    { x: 8, y: 4, w: 2, h: 2 },
    { x: 10, y: 4, w: 2, h: 2 },
    { x: 0, y: 6, w: 2, h: 2 },
    { x: 2, y: 6, w: 2, h: 2 },
    { x: 4, y: 6, w: 2, h: 2 },
    { x: 0, y: 8, w: 2, h: 2 },
    { x: 2, y: 8, w: 2, h: 2 },
    { x: 4, y: 8, w: 2, h: 2 },
    { x: 0, y: 10, w: 2, h: 2 },
    { x: 2, y: 10, w: 2, h: 2 },
    { x: 4, y: 10, w: 2, h: 2 },
    { x: 6, y: 6, w: 3, h: 3 },
    { x: 9, y: 6, w: 3, h: 3 },
    { x: 6, y: 9, w: 3, h: 3 },
    { x: 9, y: 9, w: 3, h: 3 },
  ],
};

export const DEFAULT_LAYOUTS: Record<number, GsLayoutItem[]> = Object.fromEntries(Object.entries(BASE_LAYOUTS).map(([k, items]) => [k, scaleLayout(items)]));
