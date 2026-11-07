import type { TerminalSessionInfo } from '@camera.ui/browser';
import type { ITerminalOptions } from '@xterm/xterm';

export interface CuiTerminalProps {
  autoConnect?: boolean;
  cwd?: string;
  shell?: string;
  sessionId?: string;
  name?: string;
  persistent?: boolean;
  options?: Partial<ITerminalOptions>;
  inputTransform?: (data: string) => string;
}

export interface CuiTerminalEmits {
  (e: 'connected'): void;
  (e: 'disconnected'): void;
  (e: 'session', session: TerminalSessionInfo): void;
  (e: 'error', error: Error): void;
}
