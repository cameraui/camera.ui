import type { PluginInfo, PluginInterface } from '@camera.ui/sdk';
import type { DBFloorPlan, DBRoomCatalog } from '../../api/database/types.js';

export interface HostPluginInfo extends PluginInfo {
  running: boolean;
}

export interface FloorPlan {
  rooms: DBRoomCatalog;
  plan: DBFloorPlan;
}

export interface TrainingCandidateBox {
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrainingCandidateIngest {
  cameraId: string;
  eventId: string;
  capturedAt: number;
  boxes: TrainingCandidateBox[];
  scene: Uint8Array;
}

export type TrainingIngestResult = 'stored' | 'skip' | 'disabled';

export interface CoreManagerInterface {
  ingestTrainingCandidate(payload: TrainingCandidateIngest): Promise<TrainingIngestResult>;
  getTrainingCollectionEnabled(): Promise<boolean>;
  getFFmpegPath(): Promise<string>;
  getServerAddresses(): Promise<string[]>;
  getCloudServerId(): Promise<string>;
  getPlugin(pluginName: string): Promise<HostPluginInfo | undefined>;
  getPluginsByInterface(interfaceName: PluginInterface): Promise<HostPluginInfo[]>;
  getFloorPlan(): Promise<FloorPlan>;
}

export interface CoreManagerProxyEvents {
  cloudAccountChanged: { connected: boolean };
  trainingSettingsChanged: { enabled: boolean };
  pluginStatusChanged: { pluginName: string; running: boolean };
}

export interface CoreManagerProxyEventCallbacks {
  cloudAccountChanged: (data: { connected: boolean }) => void;
  pluginStatusChanged: (data: { pluginName: string; running: boolean }) => void;
}

export interface CoreManagerProxyGenericEvent<K extends keyof CoreManagerProxyEvents> {
  type: K;
  data: CoreManagerProxyEvents[K];
}

export interface CoreManagerListenerMessagePayload {
  type: keyof CoreManagerProxyEventCallbacks;
  data: CoreManagerProxyEvents[keyof CoreManagerProxyEvents];
}
