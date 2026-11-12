export type InvokeChannel =
  | 'get-app-version'
  | 'get-update-available'
  | 'quit-and-install'
  | 'get-desktop-notifications'
  | 'set-desktop-notifications'
  | 'get-mic-access'
  | 'ask-mic-access'
  | 'open-mic-settings'
  | 'cert-trust'
  | 'get-event-popup'
  | 'get-event-popup-settings'
  | 'set-event-popup-settings'
  | 'get-cast-identity';
export type SendChannel = 'change-language' | 'change-window' | 'check-for-updates' | 'show-notification' | 'set-badge-count' | 'show-event-popup' | 'event-popup-action';
export type ReceiveChannel = 'fullscreen' | 'app-status' | 'notification-click' | 'deep-link' | 'power-resume' | 'event-popup';

export interface CertTrustPayload {
  ca: string;
  hosts: string[];
}

export interface DesktopNotificationPayload {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  deepLink?: string;
  tag?: string;
  severity?: string;
}

export interface EventPopupPayload {
  id: string;
  cameraId: string;
  cameraName: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  doorbell?: boolean;
  url: string;
  source?: 'event' | 'test' | 'cast';
}

export type EventPopupCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type EventPopupSize = 'small' | 'medium' | 'large';
export type EventPopupDisplay = 'primary' | 'app';
export type EventPopupSound = 'off' | 'doorbell' | 'all';

export interface EventPopupSettings {
  enabled: boolean;
  corner: EventPopupCorner;
  size: EventPopupSize;
  display: EventPopupDisplay;
  maxWindows: number;
  cameraIds: string[] | null;
  sound: EventPopupSound;
  pausedUntil: number | null;
}

export interface EventPopupState {
  event: EventPopupPayload;
  waiting: EventPopupPayload[];
  pinned: boolean;
  sound: boolean;
}

export interface EventPopupView extends EventPopupState {
  windows: number;
}

export type EventPopupAction = { type: 'close' | 'closeAll' | 'pin' | 'unpin' | 'open' | 'expire' } | { type: 'switch'; cameraId: string };

export interface CastIdentity {
  deviceId: string;
  name: string;
}

export interface NotificationClickPayload {
  id?: string;
  deepLink?: string;
}

export interface DeepLinkPayload {
  url: string;
  path: string;
}

export type PowerResumeReason = 'resume' | 'unlock';

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
