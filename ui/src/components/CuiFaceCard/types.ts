import type { FacePictureMarks } from '@camera.ui/nvr';

export interface CuiFaceCardProps {
  variant: 'known' | 'unknown' | 'ignored';
  thumbnail?: string;
  name?: string;
  imageCount?: number;
  marks?: FacePictureMarks;
  cameraName?: string;
  timestamp?: number;
  confidence?: number;
  clarity?: number;
  alsoFiledUnder?: string[];
  compact?: boolean;
  showRemove?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  assignValue?: string | null;
  assignOptions?: { label: string; value: string }[];
}

export interface CuiFaceCardEmits {
  click: [];
  assign: [value: string];
  'assign-prompt': [];
  skip: [];
  remove: [];
  ignore: [];
  restore: [];
}
