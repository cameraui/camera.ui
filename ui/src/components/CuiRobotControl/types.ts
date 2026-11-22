import type { Component } from 'vue';

export interface RobotOption {
  label: string;
  value: string;
}

export interface CuiRobotControlProps {
  icon: Component;
  iconStyle?: Record<string, string>;
  label?: string;
  status?: string;
  commands?: RobotOption[];
  fanSpeed?: string;
  fanSpeeds?: RobotOption[];
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiRobotControlEmits {
  command: [value: string];
  'update:fanSpeed': [value: string];
}

export const CUI_ROBOT_CONTROL_DEFAULTS = {
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiRobotControlProps>;
