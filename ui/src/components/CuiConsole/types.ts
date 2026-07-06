import type { ITerminalOptions } from '@xterm/xterm';

export interface VConsoleOptions {
  options?: Partial<ITerminalOptions>;
  ignoreBreakpoint?: boolean;
}
