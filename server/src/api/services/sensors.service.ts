import { PluginInterface } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { resolveSensorSemantics } from '../../sensors/semantics.js';
import { isWritableSensor, SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_OWNER_ID } from '../../sensors/types.js';
import { PluginsService } from './plugins.service.js';

import type { SensorSemantics, SensorType } from '@camera.ui/sdk';
import type { SensorRegistry } from '../../sensors/registry.js';
import type { Database } from '../database/index.js';
import type { CreateVirtualSensorInput, PatchSensorInput } from '../schemas/sensors.schema.js';

export interface TransformedSensor {
  id: string;
  type: SensorType;
  name: string;
  displayName: string;
  nativeId?: string;
  pluginId: string;
  pluginName: string;
  virtual: boolean;
  cameraBound: boolean;
  assignmentLocked: boolean;
  connected: boolean;
  requiresFrames: boolean;
  assignedCameraIds: string[];
  exposed: boolean;
  origin?: string;
  properties: Record<string, unknown>;
  capabilities: string[];
  semantics?: SensorSemantics;
  createdAt: number;
  updatedAt: number;
}

export class SensorsService {
  private registry: SensorRegistry;
  private plugins = new PluginsService();

  constructor() {
    this.registry = container.resolve<SensorRegistry>('sensorRegistry');
  }

  private get dbs(): Database {
    return container.resolve<Database>('dbs');
  }

  public list(cameraId?: string): TransformedSensor[] {
    return this.registry
      .getRecords()
      .filter((record) => !cameraId || record.assignedCameraIds.includes(cameraId))
      .map((record) => this.transform(record._id))
      .filter((sensor): sensor is TransformedSensor => sensor !== undefined);
  }

  public getById(id: string): TransformedSensor | undefined {
    return this.transform(id);
  }

  public async createVirtual(input: CreateVirtualSensorInput): Promise<TransformedSensor> {
    if (input.cameraId) this.assertCameraExists(input.cameraId);
    const record = await this.registry.createVirtualSensor({ type: input.type, name: input.name, assignCameraId: input.cameraId });
    return this.transform(record._id)!;
  }

  public async patch(id: string, input: PatchSensorInput): Promise<TransformedSensor | undefined> {
    if (!this.registry.getRecord(id)) return undefined;

    if (input.assignedCameraIds !== undefined) {
      for (const cameraId of input.assignedCameraIds) this.assertCameraExists(cameraId);
      await this.registry.setAssignedCameras(id, input.assignedCameraIds);
    }

    if (input.displayName !== undefined) {
      await this.registry.setDisplayName(id, input.displayName);
    }

    if (input.exposed !== undefined) {
      await this.registry.setExposed(id, input.exposed);
    }

    return this.transform(id);
  }

  public getHistory(id: string, limit?: number): { property: string; value: unknown; timestamp: number }[] | undefined {
    if (!this.registry.getRecord(id)) return undefined;
    return this.registry.getHistory(id, limit);
  }

  public async delete(id: string): Promise<'ok' | 'not-found' | 'connected'> {
    const record = this.registry.getRecord(id);
    if (!record) return 'not-found';
    if (this.registry.isConnected(id) && record.pluginInfo.id !== VIRTUAL_SENSOR_OWNER_ID) {
      // an adopted discovery sensor releases through its plugin, so the
      // plugin forgets the adoption instead of re-importing it on next sync
      if (record.nativeId && (await this.releaseFromPlugin(record.pluginInfo.id, record.nativeId))) {
        if (this.registry.getRecord(id)) await this.registry.deleteSensor(id);
        return 'ok';
      }
      return 'connected';
    }
    await this.registry.deleteSensor(id);
    return 'ok';
  }

  public async command(id: string, property: string, value: unknown): Promise<'ok' | 'not-found' | 'read-only' | 'disconnected'> {
    const record = this.registry.getRecord(id);
    if (!record) return 'not-found';
    if (!isWritableSensor(record.type, record.pluginInfo.id)) return 'read-only';

    const sensor = this.registry.getSensor(id, { connectedOnly: true });
    if (!sensor) return 'disconnected';

    await sensor.updateValue(property, value);
    return 'ok';
  }

  private transform(id: string): TransformedSensor | undefined {
    const record = this.registry.getRecord(id);
    if (!record) return undefined;

    const data = this.registry.toStoredData(record);
    return {
      id: record._id,
      type: record.type,
      name: record.name,
      displayName: data.displayName,
      nativeId: record.nativeId,
      pluginId: record.pluginInfo.id,
      pluginName: record.pluginInfo.name,
      virtual: record.pluginInfo.id === VIRTUAL_SENSOR_OWNER_ID,
      cameraBound: SENSOR_TYPE_CONFIG[record.type]?.cameraBound ?? false,
      assignmentLocked: record.boundCameraId !== undefined,
      connected: this.registry.isConnected(record._id),
      requiresFrames: data.requiresFrames ?? false,
      assignedCameraIds: data.assignedCameraIds,
      exposed: record.exposed,
      origin: record.origin,
      properties: data.properties,
      capabilities: data.capabilities,
      semantics: resolveSensorSemantics(data),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async releaseFromPlugin(pluginId: string, nativeId: string): Promise<boolean> {
    const plugin = this.plugins.getPluginById(pluginId);
    if (!plugin?.worker?.isRunning() || !plugin.contract.interfaces.includes(PluginInterface.SensorDiscovery)) return false;
    try {
      await plugin.worker.pluginProxy.onReleaseSensor?.(nativeId);
      return true;
    } catch {
      return false;
    }
  }

  private assertCameraExists(cameraId: string): void {
    if (!this.dbs.camerasDB.get(cameraId)) {
      throw new Error(`Camera "${cameraId}" not found`);
    }
  }
}
