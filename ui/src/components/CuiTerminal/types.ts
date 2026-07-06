import type { ITerminalOptions } from '@xterm/xterm';

export interface CuiTerminalProps {
  autoConnect?: boolean;
  cwd?: string;
  shell?: string;
  options?: Partial<ITerminalOptions>;
  inputTransform?: (data: string) => string;
}

export interface CuiTerminalEmits {
  (e: 'connected'): void;
  (e: 'disconnected'): void;
  (e: 'error', error: Error): void;
}
