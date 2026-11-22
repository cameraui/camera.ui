import type { Component } from 'vue';

export interface CuiSceneControlProps {
  icon: Component;
  iconStyle?: Record<string, string>;
  active?: boolean;
  lastRun?: number;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiSceneControlEmits {
  run: [];
}

export const CUI_SCENE_CONTROL_DEFAULTS = {
  active: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiSceneControlProps>;
