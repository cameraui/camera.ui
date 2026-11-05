import type { ReactiveCameraDevice } from '@camera.ui/browser';

export interface CuiPTZControlProps {
  cameraDevice: ReactiveCameraDevice;
  size?: 'small' | 'medium';
}

type NativeType = null | undefined | number | string | boolean | symbol | ((...args: any[]) => any);
type InferDefault<P, T> = ((props: P) => T & {}) | (T extends NativeType ? T : never);
type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>;
};

export const CUI_PTZ_CONTROL_DEFAULTS: InferDefaults<CuiPTZControlProps> = {
  size: 'small',
};
