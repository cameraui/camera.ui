import type { AssistantAccess, AssistantAskResult, PluginInfo, PluginInterface } from '@camera.ui/sdk';
import type { DBFloorPlan, DBRoomCatalog, TrainingBoxSource, TrainingSelection } from '../../api/database/types.js';
import type { AssistantAskRequest, AssistantPost } from '../../assistant/types.js';

export interface HostPluginInfo extends PluginInfo {
  running: boolean;
}

export interface FloorPlan {
  rooms: DBRoomCatalog;
  plan: DBFloorPlan;
}

export interface TrainingCandidateBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  source: TrainingBoxSource;
  score: number;
}

export interface TrainingCandidateIngest {
  cameraId: string;
  eventId: string;
  capturedAt: number;
  boxes: TrainingCandidateBox[];
  scene: Uint8Array;
  detectorPluginId?: string;
  selection: TrainingSelection;
  selectionScore: number;
}

export type TrainingIngestResult = 'stored' | 'skip' | 'disabled';

export interface CoreManagerInterface {
  ingestTrainingCandidate(payload: TrainingCandidateIngest): Promise<TrainingIngestResult>;
  getTrainingCollectionEnabled(): Promise<boolean>;
  getFFmpegPath(): Promise<string>;
  getServerAddresses(pluginId?: string): Promise<string[]>;
  getCloudServerId(): Promise<string>;
  getRestoreGeneration(): Promise<string>;
  getInstanceId(): Promise<string>;
  getLanguage(): Promise<string>;
  getPlugin(pluginName: string): Promise<HostPluginInfo | undefined>;
  getPluginsByInterface(interfaceName: PluginInterface): Promise<HostPluginInfo[]>;
  getFloorPlan(): Promise<FloorPlan>;
  assistantAsk(request: AssistantAskRequest): Promise<AssistantAskResult>;
  assistantAccess(pluginId: string): Promise<AssistantAccess>;
  assistantPost(post: AssistantPost): Promise<boolean>;
}

export interface CoreManagerProxyEvents {
  cloudAccountChanged: { connected: boolean };
  trainingSettingsChanged: { enabled: boolean };
  assistantModelChanged: { pluginId: string; configured: boolean };
  pluginStatusChanged: { pluginName: string; running: boolean };
  languageChanged: { language: string };
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
