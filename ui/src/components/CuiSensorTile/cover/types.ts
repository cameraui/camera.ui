import type { CoverKind } from '@camera.ui/sdk';

export interface CuiCoverSceneProps {
  kind: CoverKind;
  openRatio: number;
  tilt?: number;
  obstructed?: boolean;
  draggable?: boolean;
}

export interface CuiCoverSceneEmits {
  (e: 'input', ratio: number): void;
  (e: 'commit', ratio: number): void;
}

export interface CuiGarageSceneProps {
  openRatio: number;
  moving?: boolean;
  obstructed?: boolean;
}
