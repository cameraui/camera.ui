import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { DoorbellProperty, LockProperty, RING_AUTO_RESET_MS, SensorType } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { VIRTUAL_SENSOR_OWNER_ID } from './types.js';

import type { Database } from '../../api/database/index.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { CameraController } from '../controller.js';

@RPCClass
class VirtualSensorRpcHandler {
  constructor(private host: VirtualSensorHost) {}

  @RPCMethod
  public updateValue(property: string, value: unknown): void {
    this.host.applyUpdate(property, value);
  }
}

@RPCClass
class VirtualSensorStorageHandler {
  constructor(private host: VirtualSensorHost) {}

  @RPCMethod
  public async setInternalValue(key: string, value: unknown): Promise<void> {
    await this.host.setInternalValue(key, value);
  }
}

export class VirtualSensorHost {
  private ringResetTimer?: NodeJS.Timeout;
  private readonly disposers: (() => void | Promise<void>)[] = [];

  constructor(
    private readonly cameraController: CameraController,
    private readonly sensorId: string,
    private readonly type: SensorType,
  ) {}

  public async register(): Promise<void> {
    const proxy = container.resolve<ProxyServer>('proxy').proxy;
    const rpcNamespace = NamespaceManager.sensorProviderNamespaces(VIRTUAL_SENSOR_OWNER_ID, this.cameraController.id, this.sensorId).sensorRpc;
    const storageNamespace = NamespaceManager.pluginSensorNamespaces(VIRTUAL_SENSOR_OWNER_ID, this.cameraController.id, this.sensorId).sensorStorageRpc;

    this.disposers.push(await proxy.registerHandler(rpcNamespace, new VirtualSensorRpcHandler(this)));
    this.disposers.push(await proxy.registerHandler(storageNamespace, new VirtualSensorStorageHandler(this)));
  }

  public async dispose(): Promise<void> {
    if (this.ringResetTimer) {
      clearTimeout(this.ringResetTimer);
      this.ringResetTimer = undefined;
    }

    for (const dispose of this.disposers.reverse()) {
      try {
        await dispose();
      } catch {
        // ignore
      }
    }
    this.disposers.length = 0;
  }

  public applyUpdate(property: string, value: unknown): void {
    if (this.type === SensorType.Doorbell && (property as DoorbellProperty) === DoorbellProperty.Ring) {
      // ring=false is owned by the auto-reset timer (SDK DoorbellTrigger parity)
      if (!value) return;
      this.trigger();
      return;
    }

    // no hardware to report back — mirror targetState into currentState,
    // otherwise the UI would show "locking..." / "opening..." forever
    if (TARGET_STATE_MIRROR_TYPES.has(this.type) && (property as LockProperty) === LockProperty.TargetState) {
      const properties = { [LockProperty.TargetState]: value, [LockProperty.CurrentState]: value };
      this.write(properties);
      this.persistState(properties);
      return;
    }

    this.write({ [property]: value });
    this.persistState({ [property]: value });
  }

  public async setInternalValue(key: string, value: unknown): Promise<void> {
    if (key !== '_displayName' || typeof value !== 'string') return;

    const dbs = container.resolve<Database>('dbs');
    const record = dbs.virtualSensorsDB.get(this.sensorId);
    if (!record) return;

    record.displayName = value;
    record.updatedAt = Date.now();
    await dbs.virtualSensorsDB.put(record._id, record);
  }

  private trigger(): void {
    if (this.ringResetTimer) clearTimeout(this.ringResetTimer);

    this.write({ [DoorbellProperty.Ring]: true });
    this.ringResetTimer = setTimeout(() => {
      this.ringResetTimer = undefined;
      this.write({ [DoorbellProperty.Ring]: false });
    }, RING_AUTO_RESET_MS);
  }

  private write(properties: Record<string, unknown>): void {
    this.cameraController.sensorController.updatePropertyValues(this.sensorId, properties);
  }

  private persistState(properties: Record<string, unknown>): void {
    const dbs = container.resolve<Database>('dbs');
    const record = dbs.virtualSensorsDB.get(this.sensorId);
    if (!record) return;

    record.state = { ...record.state, ...properties };
    record.updatedAt = Date.now();
    dbs.virtualSensorsDB.put(record._id, record).catch((error) => {
      this.cameraController.logger.warn(`Failed to persist virtual sensor state ${this.sensorId}:`, error);
    });
  }
}

const TARGET_STATE_MIRROR_TYPES = new Set<SensorType>([SensorType.Lock, SensorType.Garage, SensorType.SecuritySystem]);

const hosts = new Map<string, VirtualSensorHost>();

export async function registerVirtualSensorHost(cameraController: CameraController, sensorId: string, type: SensorType): Promise<void> {
  await disposeVirtualSensorHost(sensorId);

  const host = new VirtualSensorHost(cameraController, sensorId, type);
  hosts.set(sensorId, host);
  await host.register();
}

export async function disposeVirtualSensorHost(sensorId: string): Promise<void> {
  const existing = hosts.get(sensorId);
  if (!existing) return;

  hosts.delete(sensorId);
  await existing.dispose();
}
