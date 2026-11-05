import type { Component } from 'vue';

export interface CuiCamviewControlItem {
  id: string;
  label: string;
  icon: Component;
  onClick: () => void;
}

export interface CuiCamviewControlsProps {
  start: CuiCamviewControlItem[];
  end: CuiCamviewControlItem[];
  micActive: boolean;
  micAvailable: boolean;
  micLoading?: boolean;
  disabled?: boolean;
  fab?: boolean;
}

export interface CuiCamviewControlsEmits {
  mic: [];
}
