import type { DBCamera } from '@shared/types';

export interface CuiDraggableCameraCardProps {
  camera: DBCamera;
  noDrag?: boolean;
  viewTransition?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  findCard: (id: string) => { index: number };
  moveCard: (id: string, atIndex: number) => void;
  snapshotRef: (el: any) => void;
}

export interface CuiDraggableCameraCardEmits {
  (e: 'refresh-snapshot'): void;
  (e: 'open-console'): void;
  (e: 'open-settings'): void;
  (e: 'click'): void;
}

export interface DragItem {
  id: string;
  originalIndex: number;
}
