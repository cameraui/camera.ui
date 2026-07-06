import type { PluginInfo, PluginInterface } from '@camera.ui/sdk';

export interface CoreManagerInterface {
  getFFmpegPath(): Promise<string>;
  getServerAddresses(): Promise<string[]>;
  getCloudServerId(): Promise<string>;
  getPlugin(pluginName: string): Promise<PluginInfo | undefined>;
  getPluginsByInterface(interfaceName: PluginInterface): Promise<PluginInfo[]>;
}

export interface CoreManagerProxyEvents {
  cloudAccountChanged: { connected: boolean };
}

export interface CoreManagerProxyEventCallbacks {
  cloudAccountChanged: (data: { connected: boolean }) => void;
}

export interface CoreManagerProxyGenericEvent<K extends keyof CoreManagerProxyEvents> {
  type: K;
  data: CoreManagerProxyEvents[K];
}

export interface CoreManagerListenerMessagePayload {
  type: keyof CoreManagerProxyEventCallbacks;
  data: CoreManagerProxyEvents[keyof CoreManagerProxyEvents];
}
