export type RobotPhase = 'working' | 'docked' | 'returning' | 'paused' | 'idle' | 'error';

export interface CuiRobotSceneProps {
  phase: RobotPhase;
  lawn?: boolean;
}

export interface CuiRobotBarProps {
  type: string;
  commands: string[];
  busy: boolean;
  interactive: boolean;
}

export interface CuiRobotBarEmits {
  (e: 'command', command: string): void;
}
