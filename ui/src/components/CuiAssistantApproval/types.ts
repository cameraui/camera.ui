export interface CuiAssistantApprovalProps {
  toolName: string;
  args: unknown;
  canResolve: boolean;
  busy?: boolean;
}

export interface CuiAssistantApprovalEmits {
  (e: 'approve', editedArgs?: Record<string, unknown>): void;
  (e: 'reject'): void;
}
