export type CuiToastSeverity = 'success' | 'error' | 'warn' | 'warning' | 'info';

export interface CuiToastAction {
  label: string;
  loadingLabel?: string;
  onClick: () => void | Promise<void>;
}

export interface CuiToastMessage {
  severity: CuiToastSeverity;
  summary?: string;
  detail?: string | Error | unknown;
  life?: number;
  id?: string;
  persistent?: boolean;
  action?: CuiToastAction;
}

export interface CuiToastDismissEvent {
  type: 'dismiss';
  id: string;
}
