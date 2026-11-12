import { RPCMethod } from '@camera.ui/rpc';
import { DoorbellProperty, LockProperty, RING_AUTO_RESET_MS, SensorType } from '@camera.ui/sdk';

import { inject } from '../container.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { VIRTUAL_SENSOR_OWNER_ID } from '../sensors/types.js';

import type { SensorRegistry } from './registry.js';

const TARGET_STATE_MIRROR_TYPES = new Set<SensorType>([SensorType.Lock, SensorType.Garage, SensorType.SecuritySystem]);
const hosts = new Map<string, VirtualSensorHost>();

export async function registerVirtualSensorHost(registry: SensorRegistry, sensorId: string, type: SensorType): Promise<void> {
  await disposeVirtualSensorHost(sensorId);

  const host = new VirtualSensorHost(registry, sensorId, type);
  hosts.set(sensorId, host);
  await host.register();
}

export async function disposeVirtualSensorHost(sensorId: string): Promise<void> {
  const existing = hosts.get(sensorId);
  if (!existing) return;

  hosts.delete(sensorId);
  await existing.dispose();
}

export class VirtualSensorHost {
  private ringResetTimer?: NodeJS.Timeout;
  private readonly disposers: (() => void | Promise<void>)[] = [];

  constructor(
    private readonly registry: SensorRegistry,
    private readonly sensorId: string,
    private readonly type: SensorType,
  ) {}

  public async register(): Promise<void> {
    const proxy = inject('proxy').proxy;
    const rpcNamespace = NamespaceManager.sensorProviderNamespaces(VIRTUAL_SENSOR_OWNER_ID, this.sensorId).sensorRpc;

    this.disposers.push(await proxy.registerHandler(rpcNamespace, new VirtualSensorRpcHandler(this)));

    // a restart inside the ring window skips the reset, the stored ring would stay true
    if (this.type === SensorType.Doorbell && this.registry.getPropertyValue(this.sensorId, DoorbellProperty.Ring) === true) {
      this.write({ [DoorbellProperty.Ring]: false });
    }
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

    // no hardware reports back, so currentState mirrors targetState or the UI waits forever
    if (TARGET_STATE_MIRROR_TYPES.has(this.type) && (property as LockProperty) === LockProperty.TargetState) {
      this.write({ [LockProperty.TargetState]: value, [LockProperty.CurrentState]: value });
      return;
    }

    this.write({ [property]: value });
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
    this.registry.updatePropertyValues(this.sensorId, properties);
  }
}

class VirtualSensorRpcHandler {
  constructor(private host: VirtualSensorHost) {}

  @RPCMethod
  public updateValue(property: string, value: unknown): void {
    this.host.applyUpdate(property, value);
  }
}
