export interface InstanceInfo {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'unknown';
  active: boolean;
  favorite: boolean;
  hasCredentials: boolean;
  pending2fa?: boolean;
  version?: string;
  lastUpdatedAt?: number;
  cameras?: {
    total: number;
    online: number;
    recording: number;
  };
  resources?: {
    cpuUsage: number;
    memUsed: number;
    memTotal: number;
    diskUsed: number;
    diskTotal: number;
  };
}

export interface CuiInstanceCardProps {
  instance: InstanceInfo;
  menuOpen?: boolean;
}

export interface CuiInstanceCardEmits {
  (e: 'toggle-favorite'): void;
  (e: 'open-menu', event: Event): void;
}
