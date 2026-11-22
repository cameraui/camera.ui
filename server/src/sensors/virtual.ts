import { RPCMethod } from '@camera.ui/rpc';
import {
  AirPurifierProperty,
  AirPurifierState,
  COMMAND_AUTO_RESET_MS,
  CoverProperty,
  CoverState,
  DoorbellProperty,
  HumidifierAction,
  HumidifierProperty,
  LawnMowerActivity,
  LawnMowerCommand,
  LawnMowerProperty,
  LightColorMode,
  LightProperty,
  LockProperty,
  MediaPlayerCommand,
  MediaPlayerProperty,
  MediaPlayerState,
  RING_AUTO_RESET_MS,
  SCENE_AUTO_RESET_MS,
  SceneProperty,
  SensorType,
  ThermostatAction,
  ThermostatMode,
  ThermostatProperty,
  VacuumActivity,
  VacuumCommand,
  VacuumProperty,
} from '@camera.ui/sdk';

import { inject } from '../container.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { PROPERTY_CAPABILITY_MAP, VIRTUAL_SENSOR_OWNER_ID } from '../sensors/types.js';

import type { SensorRegistry } from './registry.js';

interface Momentary {
  property: string;
  resetMs: number;
  idle: unknown;
}

const TARGET_STATE_MIRROR_TYPES = new Set<SensorType>([SensorType.Lock, SensorType.Garage, SensorType.Cover, SensorType.Valve, SensorType.SecuritySystem]);

// valves share the position names and the open and closed values of covers
const POSITION_TYPES = new Set<SensorType>([SensorType.Cover, SensorType.Valve]);

const MOMENTARY: Partial<Record<SensorType, Momentary>> = {
  [SensorType.Doorbell]: { property: DoorbellProperty.Ring, resetMs: RING_AUTO_RESET_MS, idle: false },
  [SensorType.Scene]: { property: SceneProperty.Active, resetMs: SCENE_AUTO_RESET_MS, idle: false },
  [SensorType.Vacuum]: { property: VacuumProperty.Command, resetMs: COMMAND_AUTO_RESET_MS, idle: '' },
  [SensorType.LawnMower]: { property: LawnMowerProperty.Command, resetMs: COMMAND_AUTO_RESET_MS, idle: '' },
  [SensorType.MediaPlayer]: { property: MediaPlayerProperty.Command, resetMs: COMMAND_AUTO_RESET_MS, idle: '' },
};

const COMMAND_EFFECTS: Partial<Record<SensorType, Record<string, Record<string, unknown>>>> = {
  [SensorType.Vacuum]: {
    [VacuumCommand.Start]: { [VacuumProperty.Activity]: VacuumActivity.Cleaning },
    [VacuumCommand.Spot]: { [VacuumProperty.Activity]: VacuumActivity.Cleaning },
    [VacuumCommand.Pause]: { [VacuumProperty.Activity]: VacuumActivity.Paused },
    [VacuumCommand.Stop]: { [VacuumProperty.Activity]: VacuumActivity.Idle },
    [VacuumCommand.Dock]: { [VacuumProperty.Activity]: VacuumActivity.Docked },
  },
  [SensorType.LawnMower]: {
    [LawnMowerCommand.Start]: { [LawnMowerProperty.Activity]: LawnMowerActivity.Mowing },
    [LawnMowerCommand.Pause]: { [LawnMowerProperty.Activity]: LawnMowerActivity.Paused },
    [LawnMowerCommand.Dock]: { [LawnMowerProperty.Activity]: LawnMowerActivity.Docked },
  },
  [SensorType.MediaPlayer]: {
    [MediaPlayerCommand.Play]: { [MediaPlayerProperty.On]: true, [MediaPlayerProperty.State]: MediaPlayerState.Playing },
    [MediaPlayerCommand.Pause]: { [MediaPlayerProperty.On]: true, [MediaPlayerProperty.State]: MediaPlayerState.Paused },
    [MediaPlayerCommand.Stop]: { [MediaPlayerProperty.On]: true, [MediaPlayerProperty.State]: MediaPlayerState.Idle },
  },
};

const hosts = new Map<string, VirtualSensorHost>();

export async function registerVirtualSensorHost(registry: SensorRegistry, sensorId: string, type: SensorType): Promise<void> {
  await disposeVirtualSensorHost(sensorId);

  const host = new VirtualSensorHost(registry, sensorId, type);
  hosts.set(sensorId, host);
  await host.register();
}

export function writeVirtualSensor(sensorId: string, property: string, value: unknown): void {
  hosts.get(sensorId)?.applyUpdate(property, value);
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

    this.write({ [property]: value, ...this.offered(this.followUps(property, value)) });
  }

  private followUps(property: string, value: unknown): Record<string, unknown> {
    // no hardware reports back, so what a device would report follows the write or the UI waits forever
    if (TARGET_STATE_MIRROR_TYPES.has(this.type) && (property as LockProperty) === LockProperty.TargetState) {
      if (!POSITION_TYPES.has(this.type)) return { [LockProperty.CurrentState]: value };
      const position = value === CoverState.Open ? 100 : 0;
      return { [CoverProperty.CurrentState]: value, [CoverProperty.TargetPosition]: position, [CoverProperty.CurrentPosition]: position };
    }

    if (POSITION_TYPES.has(this.type) && (property as CoverProperty) === CoverProperty.TargetPosition) {
      const state = (value as number) > 0 ? CoverState.Open : CoverState.Closed;
      return { [CoverProperty.CurrentPosition]: value, [CoverProperty.TargetState]: state, [CoverProperty.CurrentState]: state };
    }

    if (this.type === SensorType.Cover && (property as CoverProperty) === CoverProperty.TargetTilt) return { [CoverProperty.CurrentTilt]: value };
    if (this.type === SensorType.Cover && (property as CoverProperty) === CoverProperty.Stop) {
      return { [CoverProperty.Stop]: false, [CoverProperty.CurrentState]: CoverState.Stopped };
    }

    if (this.type === SensorType.MediaPlayer && (property as MediaPlayerProperty) === MediaPlayerProperty.On) {
      return { [MediaPlayerProperty.State]: value ? MediaPlayerState.Idle : MediaPlayerState.Off };
    }

    if (this.type === SensorType.Humidifier && (property as HumidifierProperty) === HumidifierProperty.On) {
      return { [HumidifierProperty.Action]: value ? HumidifierAction.Idle : HumidifierAction.Off };
    }

    if (this.type === SensorType.AirPurifier && (property as AirPurifierProperty) === AirPurifierProperty.On) {
      return { [AirPurifierProperty.State]: value ? AirPurifierState.Idle : AirPurifierState.Inactive };
    }

    if (this.type === SensorType.Light) return lightFollowUps(property as LightProperty, value);

    if (this.type === SensorType.Thermostat && (property as ThermostatProperty) === ThermostatProperty.Mode) {
      return { [ThermostatProperty.Action]: value === ThermostatMode.Off ? ThermostatAction.Off : ThermostatAction.Idle };
    }

    return {};
  }

  private offered(properties: Record<string, unknown> | undefined): Record<string, unknown> {
    // a follow-up for a capability the sensor lacks would only log a warning
    const gates = PROPERTY_CAPABILITY_MAP[this.type];
    if (!properties || !gates) return properties ?? {};

    const capabilities = this.registry.getCapabilities(this.sensorId);
    return Object.fromEntries(Object.entries(properties).filter(([property]) => !gates[property] || capabilities.includes(gates[property])));
  }

  private trigger({ property, resetMs, idle }: Momentary, value: unknown): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);

    this.write({ [property]: value, ...this.offered(COMMAND_EFFECTS[this.type]?.[String(value)]) });
    this.resetTimer = setTimeout(() => {
      this.resetTimer = undefined;
      this.write({ [property]: idle });
    }, resetMs);
  }

  private write(properties: Record<string, unknown>): void {
    this.registry.updatePropertyValues(this.sensorId, properties);
  }
}

function lightFollowUps(property: LightProperty, value: unknown): Record<string, unknown> {
  if (property === LightProperty.Brightness) return { [LightProperty.On]: (value as number) > 0 };
  if (property === LightProperty.Color) return { [LightProperty.ColorMode]: LightColorMode.Color };
  if (property === LightProperty.ColorTemperature) return { [LightProperty.ColorMode]: LightColorMode.Temperature };
  return {};
}

class VirtualSensorRpcHandler {
  constructor(private host: VirtualSensorHost) {}

  @RPCMethod
  public updateValue(property: string, value: unknown): void {
    this.host.applyUpdate(property, value);
  }
}
