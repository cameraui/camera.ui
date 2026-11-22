export interface CuiBellSceneProps {
  ringing: boolean;
  cameraId?: string;
}

export interface CuiPressSceneProps {
  press?: string;
  stamp?: number;
}

export interface CuiAccessSceneProps {
  active: boolean;
  method?: string;
  granted?: boolean;
}
