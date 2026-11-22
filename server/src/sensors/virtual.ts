import { RPCMethod } from '@camera.ui/rpc';
import {
  COMMAND_AUTO_RESET_MS,
  DoorbellProperty,
  LawnMowerActivity,
  LawnMowerCommand,
  LawnMowerProperty,
  LockProperty,
  RING_AUTO_RESET_MS,
  SCENE_AUTO_RESET_MS,
  SceneProperty,
  SensorType,
  VacuumActivity,
  VacuumCommand,
  VacuumProperty,
} from '@camera.ui/sdk';

import { inject } from '../container.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { VIRTUAL_SENSOR_OWNER_ID } from '../sensors/types.js';

import type { SensorRegistry } from './registry.js';

interface Momentary {
  property: string;
  resetMs: number;
  idle: unknown;
}

const TARGET_STATE_MIRROR_TYPES = new Set<SensorType>([SensorType.Lock, SensorType.Garage, SensorType.Cover, SensorType.Valve, SensorType.SecuritySystem]);
const MOMENTARY: Partial<Record<SensorType, Momentary>> = {
  [SensorType.Doorbell]: { property: DoorbellProperty.Ring, resetMs: RING_AUTO_RESET_MS, idle: false },
  [SensorType.Scene]: { property: SceneProperty.Active, resetMs: SCENE_AUTO_RESET_MS, idle: false },
  [SensorType.Vacuum]: { property: VacuumProperty.Command, resetMs: COMMAND_AUTO_RESET_MS, idle: '' },
  [SensorType.LawnMower]: { property: LawnMowerProperty.Command, resetMs: COMMAND_AUTO_RESET_MS, idle: '' },
};
// no hardware reports back, so a command moves the robot where it would go
const ROBOT_ACTIVITIES: Partial<Record<SensorType, Record<string, string>>> = {
  [SensorType.Vacuum]: {
    [VacuumCommand.Start]: VacuumActivity.Cleaning,
    [VacuumCommand.Spot]: VacuumActivity.Cleaning,
    [VacuumCommand.Pause]: VacuumActivity.Paused,
    [VacuumCommand.Stop]: VacuumActivity.Idle,
    [VacuumCommand.Dock]: VacuumActivity.Docked,
  },
  [SensorType.LawnMower]: {
    [LawnMowerCommand.Start]: LawnMowerActivity.Mowing,
    [LawnMowerCommand.Pause]: LawnMowerActivity.Paused,
    [LawnMowerCommand.Dock]: LawnMowerActivity.Docked,
  },
};
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
  private resetTimer?: NodeJS.Timeout;
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

    // a restart inside the reset window skips the reset, the stored value would stay
    const momentary = MOMENTARY[this.type];
    if (momentary && this.registry.getPropertyValue(this.sensorId, momentary.property) !== momentary.idle) {
      this.write({ [momentary.property]: momentary.idle });
    }
  }

  public async dispose(): Promise<void> {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
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
    const momentary = MOMENTARY[this.type];
    if (momentary?.property === property) {
      // the idle value is owned by the reset timer
      if (value !== momentary.idle) this.trigger(momentary, value);
      return;
    }

    // no hardware reports back, so currentState mirrors targetState or the UI waits forever
    if (TARGET_STATE_MIRROR_TYPES.has(this.type) && (property as LockProperty) === LockProperty.TargetState) {
      this.write({ [LockProperty.TargetState]: value, [LockProperty.CurrentState]: value });
      return;
    }

    this.write({ [property]: value });
  }

  private trigger({ property, resetMs, idle }: Momentary, value: unknown): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);

    const activity = ROBOT_ACTIVITIES[this.type]?.[String(value)];
    this.write({ [property]: value, ...(activity ? { activity } : {}) });
    this.resetTimer = setTimeout(() => {
      this.resetTimer = undefined;
      this.write({ [property]: idle });
    }, resetMs);
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
