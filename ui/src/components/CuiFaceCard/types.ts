export interface CuiFaceCardProps {
  variant: 'known' | 'unknown';
  thumbnail?: string;
  name?: string;
  imageCount?: number;
  cameraName?: string;
  timestamp?: number;
  confidence?: number;
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
}
