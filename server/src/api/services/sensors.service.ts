import { inject } from '../../container.js';
import { resolveSensorRoom } from '../../sensors/room.js';
import { resolveSensorSemantics } from '../../sensors/semantics.js';
import { isWritableSensor, SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_OWNER_ID } from '../../sensors/types.js';
import { FloorPlanService } from './floorplan.service.js';
import { RoomsService } from './rooms.service.js';

import type { SensorPropertySpec, SensorSemantics, SensorSourceState, SensorType } from '@camera.ui/sdk';
import type { SensorRegistry } from '../../sensors/registry.js';
import type { CreateSensorDeviceInput, CreateVirtualSensorInput, PatchSensorDeviceInput, PatchSensorInput } from '../schemas/sensors.schema.js';

export interface TransformedSensorDevice {
  id: string;
  name: string;
  sourceName: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  serialNumber?: string;
}

export interface TransformedSensor {
  id: string;
  type: SensorType;
  name: string;
  displayName: string;
  shortName: string;
  primary: boolean;
  device?: TransformedSensorDevice;
  nativeId?: string;
  pluginId: string;
  pluginName: string;
  virtual: boolean;
  cameraBound: boolean;
  assignmentLocked: boolean;
  boundCameraId?: string;
  connected: boolean;
  requiresFrames: boolean;
  assignedCameraIds: string[];
  roomId?: string;
  room?: string;
  exposed: boolean;
  origin?: string;
  address?: string;
  sourceState?: SensorSourceState;
  properties: Record<string, unknown>;
  capabilities: string[];
  propertySpecs: Record<string, SensorPropertySpec>;
  semantics?: SensorSemantics;
  createdAt: number;
  updatedAt: number;
}

export class SensorsService {
  private registry: SensorRegistry;
  private roomsService = new RoomsService();
  private floorPlanService = new FloorPlanService();

  constructor() {
    this.registry = inject('sensorRegistry');
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
    const record = await this.registry.createVirtualSensor({
      type: input.type,
      name: input.name,
      assignCameraId: input.cameraId,
      capabilities: input.capabilities,
      sources: input.sources,
      kind: input.kind,
      exposed: input.exposed,
      deviceId: input.deviceId,
    });
    return this.transform(record._id)!;
  }

  public createDevice(input: CreateSensorDeviceInput): TransformedSensor[] {
    const device = this.registry.createVirtualDevice(input.name, input.sensorIds);
    return this.registry.getDeviceMembers(device._id).map((record) => this.transform(record._id)!);
  }

  public async patch(id: string, input: PatchSensorInput): Promise<TransformedSensor | undefined> {
    if (!this.registry.getRecord(id)) return undefined;

    if (input.assignedCameraIds !== undefined) {
      for (const cameraId of input.assignedCameraIds) this.assertCameraExists(cameraId);
      await this.registry.setAssignedCameras(id, input.assignedCameraIds);
    }

    if (input.displayName !== undefined) {
      this.registry.setDisplayName(id, input.displayName);
    }

    if (input.exposed !== undefined) {
      await this.registry.setExposed(id, input.exposed);
    }

    if (input.deviceId !== undefined) {
      this.registry.setVirtualDevice(id, input.deviceId);
    }

    if (input.capabilities !== undefined) {
      this.registry.setVirtualCapabilities(id, input.capabilities);
    }

    if (input.sources !== undefined) {
      this.registry.setVirtualSources(id, input.sources);
    }

    if (input.roomId !== undefined) {
      await this.setRoom([id], input.roomId);
    }

    if (input.kind !== undefined) {
      this.registry.setVirtualKind(id, input.kind);
    }

    return this.transform(id);
  }

  public async patchDevice(id: string, input: PatchSensorDeviceInput): Promise<TransformedSensor[] | undefined> {
    if (!this.registry.getDevice(id)) return undefined;

    if (input.displayName !== undefined) this.registry.setDeviceDisplayName(id, input.displayName);
    if (input.exposed !== undefined) await this.registry.setDeviceExposed(id, input.exposed);
    if (input.roomId !== undefined) {
      await this.setRoom(
        this.registry.getDeviceMembers(id).map((record) => record._id),
        input.roomId,
      );
    }

    return this.registry.getDeviceMembers(id).map((record) => this.transform(record._id)!);
  }

  public async deleteDevice(id: string): Promise<boolean> {
    if (!this.registry.getDevice(id)) return false;
    await this.registry.deleteDevice(id);
    return true;
  }

  public getHistory(id: string, limit?: number): { property: string; value: unknown; timestamp: number }[] | undefined {
    if (!this.registry.getRecord(id)) return undefined;
    return this.registry.getHistory(id, limit);
  }

  public async delete(id: string): Promise<'ok' | 'not-found' | 'connected'> {
    const record = this.registry.getRecord(id);
    if (!record) return 'not-found';
    if (record.boundCameraId && record.pluginInfo.id !== VIRTUAL_SENSOR_OWNER_ID && this.registry.isConnected(id)) return 'connected';
    await this.registry.deleteSensor(id);
    return 'ok';
  }

  public async command(id: string, property: string, value: unknown): Promise<'ok' | 'not-found' | 'read-only' | 'disconnected' | { rejected: string }> {
    const record = this.registry.getRecord(id);
    if (!record) return 'not-found';
    if (!isWritableSensor(record.type, record.pluginInfo.id)) return 'read-only';

    const sensor = this.registry.getSensor(id, { connectedOnly: true });
    if (!sensor) return 'disconnected';

    try {
      await sensor.updateValue(property, value);
    } catch (error) {
      return { rejected: (error as Error).message };
    }
    return 'ok';
  }

  private transform(id: string): TransformedSensor | undefined {
    const record = this.registry.getRecord(id);
    if (!record) return undefined;

    const data = this.registry.toStoredData(record);
    const device = record.deviceId ? this.registry.getDevice(record.deviceId) : undefined;
    const room = resolveSensorRoom(record);
    return {
      id: record._id,
      type: record.type,
      name: record.name,
      displayName: data.displayName,
      shortName: data.shortName,
      primary: data.primary,
      device: device && data.device && { ...data.device, sourceName: device.name },
      nativeId: record.nativeId,
      pluginId: record.pluginInfo.id,
      pluginName: record.pluginInfo.name,
      virtual: record.pluginInfo.id === VIRTUAL_SENSOR_OWNER_ID,
      cameraBound: SENSOR_TYPE_CONFIG[record.type]?.cameraBound ?? false,
      assignmentLocked: record.boundCameraId !== undefined,
      boundCameraId: record.boundCameraId,
      connected: this.registry.isConnected(record._id),
      requiresFrames: data.requiresFrames ?? false,
      assignedCameraIds: data.assignedCameraIds,
      roomId: room?.id,
      room: room?.name,
      exposed: record.exposed,
      origin: record.origin,
      address: record.address,
      sourceState: record.sourceState,
      properties: data.properties,
      capabilities: data.capabilities,
      propertySpecs: data.propertySpecs,
      semantics: resolveSensorSemantics(data),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async setRoom(sensorIds: string[], roomId: string | null): Promise<void> {
    if (roomId && !this.roomsService.byId(roomId)) throw new Error(`Room "${roomId}" not found`);

    // a camera's own sensor sits in its camera's room
    const movable = sensorIds.filter((sensorId) => !this.registry.getRecord(sensorId)?.boundCameraId);
    for (const sensorId of movable) this.registry.setRoom(sensorId, roomId);

    const misplaced = this.floorPlanService
      .get()
      .sensors.filter((placement) => movable.includes(placement.sensorId) && placement.roomId !== roomId)
      .map((placement) => placement.sensorId);
    await this.floorPlanService.dropSensors(misplaced);
  }

  private assertCameraExists(cameraId: string): void {
    if (!inject('dbs').camerasDB.get(cameraId)) {
      throw new Error(`Camera "${cameraId}" not found`);
    }
  }
}
