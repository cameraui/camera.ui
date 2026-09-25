export interface CuiCameraPipCardEmits {
  (e: 'swap'): void;
  (e: 'expand', expanded: boolean): void;
  (e: 'streamFinishedLoading', state: boolean): void;
  (e: 'fullscreen', active: boolean): void;
}
