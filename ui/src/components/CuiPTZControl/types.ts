import type { ReactiveCameraDevice } from '@camera.ui/browser';

export interface PTZPosition {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

export type ZoomLevel = number; // 0-1

export interface CuiPTZControlProps {
  cameraDevice: ReactiveCameraDevice;
  size?: 'small' | 'medium';
}

export interface CuiPTZControlEmits {
  (e: 'panTiltChange', position: PTZPosition): void;
  (e: 'zoomChange', level: ZoomLevel): void;
}

type NativeType = null | undefined | number | string | boolean | symbol | ((...args: any[]) => any);
type InferDefault<P, T> = ((props: P) => T & {}) | (T extends NativeType ? T : never);
type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>;
};

export const CUI_PTZ_CONTROL_DEFAULTS: InferDefaults<CuiPTZControlProps> = {
  size: 'small',
};
