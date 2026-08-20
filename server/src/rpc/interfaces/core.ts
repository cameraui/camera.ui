import type { PluginInfo, PluginInterface } from '@camera.ui/sdk';

export interface HostPluginInfo extends PluginInfo {
  running: boolean;
}

export interface CoreManagerInterface {
  getFFmpegPath(): Promise<string>;
  getServerAddresses(): Promise<string[]>;
  getCloudServerId(): Promise<string>;
  getPlugin(pluginName: string): Promise<HostPluginInfo | undefined>;
  getPluginsByInterface(interfaceName: PluginInterface): Promise<HostPluginInfo[]>;
}

export interface CoreManagerProxyEvents {
  cloudAccountChanged: { connected: boolean };
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
