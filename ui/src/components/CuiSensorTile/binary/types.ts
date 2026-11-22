import type { Component } from 'vue';

export type BinaryGroup = 'alarm' | 'leak' | 'contact' | 'presence' | 'power' | 'vibration';

export interface CuiAlarmSceneProps {
  icon: Component;
  active: boolean;
  calm?: string;
}

export interface CuiContactSceneProps {
  open: boolean;
  window?: boolean;
}

export interface CuiBinarySceneProps {
  active: boolean;
}
