import type { TopNavbarItemStatus } from '@/components/CuiTopNavbarItem/types.js';

export const TERMINAL_TAB_DND_TYPE = 'terminal-tab';

export const TERMINAL_TAB_NAME_MAX_LENGTH = 32;

export interface CuiTerminalTabProps {
  id: string;
  name: string;
  active?: boolean;
  closeable?: boolean;
  status?: TopNavbarItemStatus;
}

export interface CuiTerminalTabEmits {
  (e: 'select'): void;
  (e: 'close'): void;
  (e: 'rename', name: string): void;
  (e: 'move', draggedId: string, after: boolean): void;
}
