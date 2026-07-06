export type ChargingState = 'NOT_CHARGEABLE' | 'NOT_CHARGING' | 'CHARGING' | 'FULL';

export interface CuiBatteryInfoProps {
  level?: number;
  charging?: ChargingState;
  low?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}
