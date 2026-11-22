import type { Component } from 'vue';

export interface MediaPlayerOption {
  label: string;
  value: string;
}

export interface CuiMediaPlayerControlProps {
  icon: Component;
  iconStyle?: Record<string, string>;
  label?: string;
  status?: string;
  on?: boolean;
  hasPower?: boolean;
  playing?: boolean;
  commands?: MediaPlayerOption[];
  volume?: number;
  hasVolume?: boolean;
  muted?: boolean;
  hasMute?: boolean;
  source?: string;
  sources?: MediaPlayerOption[];
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiMediaPlayerControlEmits {
  'update:on': [value: boolean];
  command: [value: string];
  'update:volume': [value: number];
  'update:muted': [value: boolean];
  'update:source': [value: string];
}

export const CUI_MEDIA_PLAYER_CONTROL_DEFAULTS = {
  on: false,
  hasPower: false,
  playing: false,
  volume: 0,
  hasVolume: false,
  muted: false,
  hasMute: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiMediaPlayerControlProps>;
