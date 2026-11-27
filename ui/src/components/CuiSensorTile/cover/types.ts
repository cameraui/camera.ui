import type { CoverKind } from '@camera.ui/sdk';

export interface CuiCoverSceneProps {
  kind: CoverKind;
  openRatio: number;
  tilt?: number;
  obstructed?: boolean;
  draggable?: boolean;
  tapToggles?: boolean;
}

export interface CuiCoverSceneEmits {
  (e: 'input', ratio: number): void;
  (e: 'commit', ratio: number): void;
  (e: 'toggle'): void;
}

export interface CuiGarageSceneProps {
  openRatio: number;
  moving?: boolean;
  obstructed?: boolean;
}
