export interface CoreManagerNamespaces {
  coreManagerSubject: string;
  coreManagerRpc: string;
}

export interface DeviceManagerNamespaces {
  deviceManagerSubject: string;
  deviceManagerRpc: string;
}

export interface FrameWorkerNamespaces {
  frameWorkerChildRpc: string;
  frameWorkerChild: string;
}

export interface PluginNamespaces {
  pluginDeviceManagerSubject: string;
  pluginChildRpc: string;
  pluginChild: string;
  pluginStorageRpc: string;
  pluginConfigStoreRpc: string;
}

export interface CameraNamespaces {
  cameraSubject: string;
  cameraControllerRpc: string;
}

export interface PluginCameraNamespaces {
  cameraInterfacesRpc: string;
  cameraStorageRpc: string;
  cameraImplRpc: string;
}

export interface PluginSensorNamespaces {
  sensorStorageRpc: string;
}

export interface SensorControllerNamespaces {
  sensorSubject: string;
  sensorRpc: string;
  sensorWriteSubject: string;
}

export interface SensorEventNamespaces {
  sensorSubject: string;
}

export interface SensorProviderNamespaces {
  sensorRpc: string;
}

export interface FrameWorkerDetectionNamespaces {
  detectionRpc: string;
}

export interface DetectionEventNamespaces {
  detectionEventSubject: string;
}

export interface TerminalManagerNamespaces {
  terminalManagerSubject: string;
  terminalManagerRpc: string;
}

export interface DiscoveryManagerNamespaces {
  discoveryManagerSubject: string;
  discoveryManagerRpc: string;
}

export interface DownloadManagerNamespaces {
  downloadManagerRpc: string;
}

export interface NotificationManagerNamespaces {
  notificationsPublishSubject: string;
}

export class NamespaceManager {
  static coreManagerNamespaces(): CoreManagerNamespaces {
    return {
      coreManagerSubject: 'coreManager.subscriber',
      coreManagerRpc: 'coreManager.rpc',
    };
  }

  static deviceManagerNamespaces(): DeviceManagerNamespaces {
    return {
      deviceManagerSubject: 'deviceManager.subscriber',
      deviceManagerRpc: 'deviceManager.rpc',
    };
  }

  static discoveryManagerNamespaces(): DiscoveryManagerNamespaces {
    return {
      discoveryManagerSubject: 'discoveryManager.subscriber',
      discoveryManagerRpc: 'discoveryManager.rpc',
    };
  }

  static pluginNamespaces(pluginId: string): PluginNamespaces {
    return {
      pluginDeviceManagerSubject: `plugin.${pluginId}.deviceManager.subscriber`,
      pluginChildRpc: `plugin.${pluginId}.child.rpc`,
      pluginChild: `plugin.${pluginId}.child`,
      pluginStorageRpc: `plugin.${pluginId}.storage.rpc`,
      pluginConfigStoreRpc: `plugin.${pluginId}.configstore.rpc`,
    };
  }

  static pluginFileServeRpc(pluginId: string): string {
    return `plugin.${pluginId}.fileserve.rpc`;
  }

  static cameraNamespaces(cameraId: string): CameraNamespaces {
    return {
      cameraSubject: `camera.${cameraId}.subscriber`,
      cameraControllerRpc: `camera.${cameraId}.controller.rpc`,
    };
  }

  static frameWorkerNamespaces(cameraId: string): FrameWorkerNamespaces {
    return {
      frameWorkerChildRpc: `camera.${cameraId}.frameWorker.child.rpc`,
      frameWorkerChild: `camera.${cameraId}.frameWorker.child`,
    };
  }

  static pluginCameraNamespaces(pluginId: string, cameraId: string): PluginCameraNamespaces {
    return {
      cameraInterfacesRpc: `plugin.${pluginId}.camera.${cameraId}.cameraInterfaces.rpc`,
      cameraStorageRpc: `plugin.${pluginId}.camera.${cameraId}.cameraStorage.rpc`,
      cameraImplRpc: `plugin.${pluginId}.camera.${cameraId}.impl.rpc`,
    };
  }

  static pluginSensorNamespaces(pluginId: string, cameraId: string, sensorId: string): PluginSensorNamespaces {
    return {
      sensorStorageRpc: `plugin.${pluginId}.camera.${cameraId}.sensor.${sensorId}.storage.rpc`,
    };
  }

  static sensorControllerNamespaces(cameraId: string): SensorControllerNamespaces {
    return {
      sensorSubject: `camera.${cameraId}.sensors.subject`,
      sensorRpc: `camera.${cameraId}.sensors.rpc`,
      sensorWriteSubject: `camera.${cameraId}.sensors.writes`,
    };
  }

  static sensorEventNamespaces(cameraId: string, sensorId: string): SensorEventNamespaces {
    return {
      sensorSubject: `camera.${cameraId}.sensor.${sensorId}.subject`,
    };
  }

  static sensorProviderNamespaces(pluginId: string, cameraId: string, sensorId: string): SensorProviderNamespaces {
    return {
      sensorRpc: `plugin.${pluginId}.camera.${cameraId}.sensor.${sensorId}.rpc`,
    };
  }

  static frameWorkerDetectionNamespaces(cameraId: string): FrameWorkerDetectionNamespaces {
    return {
      detectionRpc: `camera.${cameraId}.frameWorker.detection.rpc`,
    };
  }

  static detectionEventNamespaces(cameraId: string): DetectionEventNamespaces {
    return {
      detectionEventSubject: `camera.${cameraId}.events.subject`,
    };
  }

  static sensorControllerRpc(cameraId: string): string {
    return `camera.${cameraId}.sensors.controller.rpc`;
  }

  static terminalManagerNamespaces(): TerminalManagerNamespaces {
    return {
      terminalManagerSubject: 'terminalManager.subscriber',
      terminalManagerRpc: 'terminalManager.rpc',
    };
  }

  static downloadManagerNamespaces(): DownloadManagerNamespaces {
    return {
      downloadManagerRpc: 'downloadManager.rpc',
    };
  }

  static notificationManagerNamespaces(): NotificationManagerNamespaces {
    return {
      notificationsPublishSubject: 'notifications.publish',
    };
  }

  static workerAgentRpc(agentId: string): string {
    return `worker.${agentId}.rpc`;
  }

  static workerManagerRpc(): string {
    return 'workers.manager.rpc';
  }

  static workerSync(agentId: string): string {
    return `worker.${agentId}.sync`;
  }

  static workerDisconnect(): string {
    return 'workers.disconnect';
  }

  static workerLogs(): string {
    return 'workers.logs';
  }
}
