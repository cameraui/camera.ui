import { SensorType } from '@camera.ui/sdk';

import { SENSOR_TYPE_CONFIG } from '../sensors/types.js';

import type { Promisify } from '@camera.ui/rpc';
import type { AudioModelSpec, ModelSpec, ObjectModelSpec, VideoInputSpec } from '@camera.ui/sdk';
import type { DetectionPluginInterface } from '../../rpc/interfaces/detection.js';

export type AnyModelSpec = ObjectModelSpec | ModelSpec | AudioModelSpec;

export interface RegisteredPlugin {
  pluginId: string;
  sensorId: string;
  sensorType: SensorType;
  requiresFrames: boolean;
  modelSpec?: AnyModelSpec;
  proxy: Promisify<DetectionPluginInterface>;
}

export function hasSecondaryModelSpec(spec: AnyModelSpec | undefined): spec is ModelSpec {
  return spec !== undefined && 'triggerLabels' in spec && Array.isArray(spec.triggerLabels);
}

export function isVideoInputSpec(spec: unknown): spec is VideoInputSpec {
  return spec != null && typeof spec === 'object' && 'width' in spec && 'height' in spec && 'format' in spec;
}

export function isAudioModelSpec(spec: AnyModelSpec | undefined): spec is AudioModelSpec {
  return spec !== undefined && 'input' in spec && typeof spec.input === 'object' && 'sampleRate' in spec.input;
}

export class PluginRegistry {
  private readonly single = new Map<SensorType, RegisteredPlugin>();
  private readonly multi = new Map<SensorType, Map<string, RegisteredPlugin>>();

  public register(plugin: RegisteredPlugin): boolean {
    if (this.isMultiProvider(plugin.sensorType)) {
      let typePlugins = this.multi.get(plugin.sensorType);
      if (!typePlugins) {
        typePlugins = new Map();
        this.multi.set(plugin.sensorType, typePlugins);
      }
      if (typePlugins.has(plugin.pluginId)) return false;
      typePlugins.set(plugin.pluginId, plugin);
      return true;
    }

    if (this.single.has(plugin.sensorType)) return false;
    this.single.set(plugin.sensorType, plugin);
    return true;
  }

  public removeBySensor(sensorId: string): RegisteredPlugin[] {
    const removed: RegisteredPlugin[] = [];

    for (const [sensorType, plugin] of this.single) {
      if (plugin.sensorId === sensorId) {
        this.single.delete(sensorType);
        removed.push(plugin);
      }
    }

    for (const [sensorType, typePlugins] of this.multi) {
      for (const [pluginId, plugin] of typePlugins) {
        if (plugin.sensorId === sensorId) {
          typePlugins.delete(pluginId);
          removed.push(plugin);
        }
      }
      if (typePlugins.size === 0) this.multi.delete(sensorType);
    }

    return removed;
  }

  public get(sensorType: SensorType): RegisteredPlugin | undefined {
    return this.single.get(sensorType);
  }

  public getAll(sensorType: SensorType): RegisteredPlugin[] {
    if (this.isMultiProvider(sensorType)) {
      const typePlugins = this.multi.get(sensorType);
      return typePlugins ? [...typePlugins.values()] : [];
    }
    const plugin = this.single.get(sensorType);
    return plugin ? [plugin] : [];
  }

  public has(sensorType: SensorType): boolean {
    if (this.isMultiProvider(sensorType)) {
      const typePlugins = this.multi.get(sensorType);
      return typePlugins !== undefined && typePlugins.size > 0;
    }
    return this.single.has(sensorType);
  }

  public hasAny(): boolean {
    if (this.single.size > 0) return true;
    for (const typePlugins of this.multi.values()) {
      if (typePlugins.size > 0) return true;
    }
    return false;
  }

  public shouldVideoBeActive(): boolean {
    if (this.single.get(SensorType.Motion)?.requiresFrames) return true;
    if (this.single.has(SensorType.Audio) && this.single.get(SensorType.Object)?.requiresFrames) return true;
    return false;
  }

  public shouldAudioBeActive(): boolean {
    return this.single.get(SensorType.Audio)?.requiresFrames === true;
  }

  public hasFrameBasedSecondary(): boolean {
    if (this.single.get(SensorType.Face)?.requiresFrames) return true;
    if (this.single.get(SensorType.LicensePlate)?.requiresFrames) return true;
    if (this.single.get(SensorType.Clip)?.requiresFrames) return true;
    for (const plugin of this.getAll(SensorType.Classifier)) {
      if (plugin.requiresFrames) return true;
    }
    return false;
  }

  public needsAdHocLoop(): boolean {
    const obj = this.single.get(SensorType.Object);
    if (!obj) return false;
    if (obj.requiresFrames) return true;
    return this.hasFrameBasedSecondary();
  }

  private isMultiProvider(sensorType: SensorType): boolean {
    return SENSOR_TYPE_CONFIG[sensorType]?.multiProvider === true;
  }
}
