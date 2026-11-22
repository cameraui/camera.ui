import { FanDirection } from '@camera.ui/sdk';

import type { Component } from 'vue';

export interface FanOption {
  label: string;
  value: string;
}

export interface CuiFanControlProps {
  icon: Component;
  iconStyle?: Record<string, string>;
  status?: string;
  on?: boolean;
  speed?: number;
  speedStep?: number;
  hasSpeed?: boolean;
  direction?: FanDirection;
  hasDirection?: boolean;
  oscillating?: boolean;
  hasOscillation?: boolean;
  preset?: string;
  presets?: FanOption[];
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiFanControlEmits {
  'update:on': [value: boolean];
  'update:speed': [value: number];
  'update:direction': [value: FanDirection];
  'update:oscillating': [value: boolean];
  'update:preset': [value: string];
}

export const CUI_FAN_CONTROL_DEFAULTS = {
  on: false,
  speed: 100,
  speedStep: 1,
  hasSpeed: false,
  direction: FanDirection.Forward,
  hasDirection: false,
  oscillating: false,
  hasOscillation: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiFanControlProps>;
