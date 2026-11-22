export interface CuiMediaTransportProps {
  commands: string[];
  playing: boolean;
  interactive: boolean;
  compact?: boolean;
}

export interface CuiMediaTransportEmits {
  (e: 'command', command: string): void;
}

export interface CuiScreenSceneProps {
  lit: boolean;
  playing: boolean;
  projector?: boolean;
}

export interface CuiSoundSceneProps {
  lit: boolean;
  playing: boolean;
}
