import type { Component } from 'vue';

export interface FanControl {
  key: string;
  icon: Component;
  label: string;
  caption: string;
  active: boolean;
  press: () => void;
}

export interface CuiFanSceneProps {
  lit: boolean;
  ratio: number;
  reverse?: boolean;
  oscillating?: boolean;
}

export interface CuiPurifierSceneProps {
  lit: boolean;
  working: boolean;
  ratio: number;
}
