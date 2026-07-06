import type { DBRemoteDirectMode } from '../api/database/types.js';

export interface DirectOverrideStatus {
  active: boolean;
  fallback: boolean;
}

export interface RemoteAccessStatus {
  enabled: boolean;
  directEnabled: boolean;
  directMode: DBRemoteDirectMode;
  externalUrl: string | null;
  override: DirectOverrideStatus;
}

export interface TunnelStatus {
  connected: boolean;
  connectedAt?: number;
}

export interface ConnectionInfo {
  internalAddresses: string[];
  externalUrl: string | null;
  cloudAddress: string | null;
  currentConnection: {
    type: 'local' | 'lan' | 'external' | 'cloud';
    address: string;
  };
}

export interface RemoteTestResult {
  ok: boolean;
  message: string;
  testedAt: number;
  details?: Record<string, unknown>;
}
