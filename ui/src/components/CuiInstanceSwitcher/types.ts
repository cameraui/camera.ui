import type { UserData } from '@shared/types';

export interface InstanceTokenEntry {
  userData: UserData | null;
  lastConnectedAt: number | null;
  url?: string;
}

export type InstanceTokens = Record<string, InstanceTokenEntry>;

export interface ActiveInstanceInfo {
  id: string;
  name: string;
  url: string;
}

export interface RedirectInfo {
  sourceUrl: string;
  instanceName: string;
}

export interface InstanceEntry {
  id: string;
  name: string;
  url: string;
  hasCredentials: boolean;
  favorite: boolean;
  userData: UserData | null;
  lastConnectedAt: number | null;
  isHome: boolean;
}

export interface EditInstanceDialogProps {
  currentName: string;
  currentUrl?: string;
  hasCredentials?: boolean;
}
