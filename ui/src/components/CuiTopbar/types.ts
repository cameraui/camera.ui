import type { TopbarPosition } from '@/composables/useCuiTopbarSlots.js';

export const TOPBAR_SIZE = {
  HEIGHT: 60,
};

export type CuiTopbarProps = {
  offsetLeft: number;
  animate?: boolean;
  background?: string;
};

export interface CuiTopbarSlotProps {
  position: TopbarPosition;
}
