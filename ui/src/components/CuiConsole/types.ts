import type { ITerminalOptions } from '@xterm/xterm';

export type ConsoleScroll = { kind: 'bottom' } | { kind: 'keep'; line: number; rowOffset: number } | { kind: 'target'; line: number };

export interface ConsoleLinePosition {
  line: number;
  rowOffset: number;
}

export interface VConsoleOptions {
  options?: Partial<ITerminalOptions>;
  ignoreBreakpoint?: boolean;
}
