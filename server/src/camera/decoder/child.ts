process.title = process.argv[2] ?? 'camera.ui - Frame Worker';

import { Logger } from '@camera.ui/common/logger';
import { SignalHandler } from '@camera.ui/common/utils';
import { RPCClass, RPCMethod, createRPCClient } from '@camera.ui/rpc';
import { AV_LOG_WARNING } from 'node-av/constants';
import { Log } from 'node-av/lib';
import { fileURLToPath } from 'node:url';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { DetectionCoordinator } from './detection-coordinator.js';

import type { LoggerOptions } from '@camera.ui/common';
import type { PrivateChannel, RPCClient } from '@camera.ui/rpc';
import type { CameraDetectionSettings, CameraFrameWorkerSettings, CameraUiSettings, DetectionLine, DetectionZone, PtzAutotrackSettings } from '@camera.ui/sdk';
import type { CoreManagerNamespaces, FrameWorkerNamespaces } from '../../rpc/namespaces.js';
import type { DetectionCoordinatorConfig } from './detection-coordinator.js';
import type { WorkerToMainMessage } from './types.js';

const ignorableLogMessages = [
  'vt decoder cb: output image buffer is null',
  'hardware accelerator failed to decode picture',
  'Could not find ref with POC',
  'Error constructing the frame RPS',
  'Skipping invalid undecodable NALU',
  'reference picture missing during reorder',
  'Missing reference picture',
];

@RPCClass
export class FrameWorkerChild {
  public readonly proxy: RPCClient;
  public readonly namespaces: FrameWorkerNamespaces & CoreManagerNamespaces;
  public readonly logger: Logger;

  private channel?: PrivateChannel;
  private closeDetectionHandler?: () => Promise<void>;
  private closeChildHandler?: () => Promise<void>;
  private signalHandler: SignalHandler;

  private detectionCoordinator?: DetectionCoordinator;

  constructor() {
    this.proxy = createRPCClient({
      name: NamespaceManager.frameWorkerNamespaces(process.env.CAMERA_ID!).frameWorkerChild,
      servers: process.env.PROXY_ENDPOINTS!.split(','),
      auth: {
        user: process.env.PROXY_USER!,
        password: process.env.PROXY_PASSWORD!,
      },
    });

    this.namespaces = {
      ...NamespaceManager.frameWorkerNamespaces(process.env.CAMERA_ID!),
      ...NamespaceManager.coreManagerNamespaces(),
    };

    const loggerOptions: LoggerOptions = {
      prefix: 'Frame Worker',
      suffix: process.env.CAMERA_NAME!,
      debugEnabled: process.env.LOGGER_LEVEL === 'debug' || process.env.LOGGER_LEVEL === 'trace',
      traceEnabled: process.env.LOGGER_LEVEL === 'trace',
      targetId: process.env.CAMERA_ID!,
      targetType: 'camera',
    };

    this.logger = new Logger(loggerOptions);
    this.logger.setChildProcessMode(true);

    Log.setCallback(
      (_, message) => {
        if (ignorableLogMessages.some((ignorable) => message.includes(ignorable))) {
          return;
        }

        this.logger.trace(message);
      },
      { maxLevel: AV_LOG_WARNING },
    );

    this.signalHandler = new SignalHandler({
      displayName: '[Signal]',
      timeoutDuration: 1000,
      logger: this.logger,
      closeFunction: this.close.bind(this),
    });
  }

  public async run(): Promise<void> {
    try {
      await this.proxy.connect();
      await this.onStart();
    } catch (error: any) {
      this.logger.error(`Failed to connect to proxy server: ${error.message}`);
      process.exit(1);
    }
  }

  @RPCMethod
  public async initialize(config: DetectionCoordinatorConfig): Promise<void> {
    this.detectionCoordinator = new DetectionCoordinator(config, this.proxy, this.logger);

    const detectionNamespaces = NamespaceManager.frameWorkerDetectionNamespaces(process.env.CAMERA_ID!);
    this.closeDetectionHandler = await this.proxy.registerHandler(detectionNamespaces.detectionRpc, this.detectionCoordinator, {
      isolatedConnection: true,
    });
  }

  @RPCMethod
  public updateZones(zones: DetectionZone[]): void {
    this.detectionCoordinator?.updateZones(zones);
  }

  @RPCMethod
  public updateLines(lines: DetectionLine[]): void {
    this.detectionCoordinator?.updateLines(lines);
  }

  @RPCMethod
  public updateDetectionSettings(settings: CameraDetectionSettings): void {
    this.detectionCoordinator?.updateDetectionSettings(settings);
  }

  @RPCMethod
  public updatePtzAutotrackSettings(settings: PtzAutotrackSettings): void {
    this.detectionCoordinator?.updatePtzAutotrackSettings(settings);
  }

  @RPCMethod
  public updateFrameWorkerSettings(settings: CameraFrameWorkerSettings): void {
    this.detectionCoordinator?.updateFrameWorkerSettings(settings);
  }

  @RPCMethod
  public updateInterfaceSettings(settings: CameraUiSettings): void {
    this.detectionCoordinator?.updateInterfaceSettings(settings);
  }

  @RPCMethod
  public updateCameraName(name: string): void {
    this.logger.suffix = name;
  }

  private async onStart(): Promise<void> {
    this.channel = await this.proxy.privateChannel('frameworker-communication', 'camera.ui');

    this.closeChildHandler = await this.proxy.registerHandler(this.namespaces.frameWorkerChildRpc, this, {
      isolatedConnection: true,
    });

    // Signal ready to Main Process
    this.sendMessage({ message: 'started', data: {} });
  }

  private async sendMessage(message: WorkerToMainMessage): Promise<void> {
    await this.channel?.send<WorkerToMainMessage>(message);
  }

  private async close(): Promise<void> {
    await this.detectionCoordinator?.dispose();
    await this.channel?.close();
    await this.closeDetectionHandler?.();
    await this.closeChildHandler?.();
    await this.proxy.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const frameworker = new FrameWorkerChild();
  frameworker.run();
}
