export type InvokeChannel = 'get-app-version' | 'get-update-available' | 'quit-and-install' | 'get-desktop-notifications' | 'set-desktop-notifications';
export type SendChannel = 'change-language' | 'change-window' | 'check-for-updates' | 'show-notification' | 'set-badge-count';
export type ReceiveChannel = 'fullscreen' | 'app-status' | 'notification-click' | 'deep-link';

export interface DesktopNotificationPayload {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  deepLink?: string;
  tag?: string;
  severity?: string;
}

export interface NotificationClickPayload {
  id?: string;
  deepLink?: string;
}

export interface DeepLinkPayload {
  url: string;
  path: string;
}

export type UpdateStatus = 'checking' | 'available' | 'not-available' | 'error' | 'progress' | 'downloaded' | 'installing' | 'development';
export type ServiceStatus = 'initializing' | 'ready' | 'error' | 'starting' | 'stopping' | 'restarting' | 'message';

export interface StatusData {
  text: string;
  message?: string;
}

export interface AppStatusPayload {
  channel: 'update-check' | 'service-status';
  status: UpdateStatus | ServiceStatus;
  data: StatusData;
}

export type IpcRendererEvent = unknown;
export type IpcRendererListener = (event: IpcRendererEvent, ...args: any[]) => void;

export interface ElectronAPI {
  invoke: (channel: InvokeChannel, data?: any) => Promise<any>;
  send: (channel: SendChannel, data?: any) => void;
  on: (channel: ReceiveChannel, listener: IpcRendererListener) => void;
  once: (channel: ReceiveChannel, listener: IpcRendererListener) => void;
  off: (channel: ReceiveChannel, listener: IpcRendererListener) => void;
  removeListener: (channel: ReceiveChannel, listener: IpcRendererListener) => void;
  removeAllListeners: (channel: ReceiveChannel) => void;
}
