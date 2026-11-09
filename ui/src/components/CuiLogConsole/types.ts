import type { ITerminalOptions } from '@xterm/xterm';

export interface CuiLogConsoleProps {
  options?: Partial<ITerminalOptions>;
  search?: string;
  ignoreBreakpoint?: boolean;
}

export interface CuiLogConsoleEmits {
  resize: [cols: number];
}

export const CUI_LOG_CONSOLE_DEFAULTS = {
  search: '',
  ignoreBreakpoint: false,
} as const;
