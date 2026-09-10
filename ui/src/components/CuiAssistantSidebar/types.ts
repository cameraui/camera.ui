import type { AssistantThreadSummary } from '@shared/types';

export const ASSISTANT_SIDEBAR_WIDTH = 288;

export interface CuiAssistantSidebarProps {
  threads: AssistantThreadSummary[];
  activeId: string | null;
  isOpen: boolean;
  isOverlay: boolean;
  loading?: boolean;
  collapsible?: boolean;
}

export interface CuiAssistantSidebarEmits {
  (e: 'select', threadId: string): void;
  (e: 'create'): void;
  (e: 'delete', threadId: string): void;
  (e: 'deleteAll'): void;
  (e: 'close'): void;
}
