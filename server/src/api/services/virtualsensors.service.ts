import { randomBytes } from 'node:crypto';
import { container } from 'tsyringe';

import {
  isVirtualSensorType,
  SENSOR_TYPE_CONFIG,
  VIRTUAL_SENSOR_DEFAULT_CAPABILITIES,
  VIRTUAL_SENSOR_DEFAULT_PROPERTIES,
  VIRTUAL_SENSOR_OWNER_ID,
  VIRTUAL_SENSOR_OWNER_NAME,
} from '../../camera/sensors/types.js';
import { disposeVirtualSensorHost, registerVirtualSensorHost } from '../../camera/sensors/virtual.js';
import { CamerasService } from './cameras.service.js';

import type { AssignedPlugin, PluginAssignments, SensorType } from '@camera.ui/sdk';
import type { SensorJSON } from '@camera.ui/sdk/internal';
import type { CameraUiAPI } from '../../api.js';
import type { CameraController } from '../../camera/controller.js';
import type { InternalEventBus, SystemEventPayload } from '../../internal-bus.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBVirtualSensor } from '../database/types.js';
import type { CreateVirtualSensorInput, PatchVirtualSensorInput } from '../schemas/virtualsensors.schema.js';

let cameraRemovedCleanupInstalled = false;

function installCameraRemovedCleanup(): void {
  if (cameraRemovedCleanupInstalled) return;
  cameraRemovedCleanupInstalled = true;

  const bus = container.resolve<InternalEventBus>('internalBus');
  bus.onEvent('camera:removed', (payload) => {
    const { cameraId } = payload as SystemEventPayload;
    if (!cameraId) return;

    const dbs = container.resolve<Database>('dbs');
    for (const { value } of dbs.virtualSensorsDB.getRange()) {
      if (value.cameraId !== cameraId) continue;
      disposeVirtualSensorHost(value._id);
      dbs.virtualSensorsDB.remove(value._id);
    }
  });
}

export class VirtualSensorsService {
  private dbs: Database;
  private logger: LoggerService;
  private api: CameraUiAPI;
  private camerasService: CamerasService;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.logger = container.resolve<LoggerService>('logger');
    this.api = container.resolve<CameraUiAPI>('api');
    this.camerasService = new CamerasService();

    installCameraRemovedCleanup();
  }

  public list(): DBVirtualSensor[] {
    return [...this.dbs.virtualSensorsDB.getRange()].map(({ value }) => value);
  }

  public listByCamera(cameraId: string): DBVirtualSensor[] {
    return this.list().filter((record) => record.cameraId === cameraId);
  }

  public getById(id: string): DBVirtualSensor | undefined {
    return this.dbs.virtualSensorsDB.get(id);
  }

  public async create(input: CreateVirtualSensorInput): Promise<DBVirtualSensor> {
    const cameraController = this.api.getCamera(input.cameraId);
    if (!cameraController) {
      throw new Error(`Camera "${input.cameraId}" not found`);
    }

    const duplicate = this.listByCamera(input.cameraId).find((record) => record.type === input.type && record.name === input.name);
    if (duplicate) {
      throw new Error(`A virtual ${input.type} sensor named "${input.name}" already exists on this camera`);
    }

    const record: DBVirtualSensor = {
      _id: randomBytes(12).toString('hex'),
      cameraId: input.cameraId,
      type: input.type,
      name: input.name,
      displayName: input.name,
      state: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.dbs.virtualSensorsDB.put(record._id, record);
    await this.activate(record, cameraController);

    this.logger.log(`Virtual sensor created: ${record.name} (${record.type}) on camera ${cameraController.name}`);

    return record;
  }

  public async patch(id: string, input: PatchVirtualSensorInput): Promise<DBVirtualSensor | undefined> {
    const record = this.getById(id);
    if (!record) return undefined;

    const sensor = this.api.getCamera(record.cameraId)?.sensorController.getSensor(id);
    if (sensor) {
      await sensor.setDisplayNameAsync(input.displayName);
    } else {
      record.displayName = input.displayName;
      record.updatedAt = Date.now();
      await this.dbs.virtualSensorsDB.put(id, record);
    }

    return this.getById(id);
  }

  public async delete(id: string): Promise<boolean> {
    const record = this.getById(id);
    if (!record) return false;

    const cameraController = this.api.getCamera(record.cameraId);
    cameraController?.sensorController.unregisterSensor(id);
    await disposeVirtualSensorHost(id);

    await this.dbs.virtualSensorsDB.remove(id);
    await this.removeAssignmentIfUnused(record.cameraId, record.type);

    this.logger.log(`Virtual sensor deleted: ${record.name} (${record.type})`);

    return true;
  }

  public async hydrateCamera(cameraController: CameraController): Promise<void> {
    for (const record of this.listByCamera(cameraController.id)) {
      await this.activate(record, cameraController);
    }
  }

  private async activate(record: DBVirtualSensor, cameraController: CameraController): Promise<void> {
    await this.ensureAssignment(record.cameraId, record.type);
    await registerVirtualSensorHost(cameraController, record._id, record.type);

    const defaults = isVirtualSensorType(record.type) ? VIRTUAL_SENSOR_DEFAULT_PROPERTIES[record.type] : {};
    const capabilities = isVirtualSensorType(record.type) ? (VIRTUAL_SENSOR_DEFAULT_CAPABILITIES[record.type] ?? []) : [];
    const sensorJSON: SensorJSON = {
      id: record._id,
      type: record.type,
      name: record.name,
      displayName: record.displayName,
      category: SENSOR_TYPE_CONFIG[record.type].category,
      cameraId: record.cameraId,
      pluginId: VIRTUAL_SENSOR_OWNER_ID,
      properties: { ...defaults, ...record.state },
      capabilities,
    };

    cameraController.sensorController.registerSensor(sensorJSON, VIRTUAL_SENSOR_OWNER_ID);
  }

  private async ensureAssignment(cameraId: string, type: SensorType): Promise<void> {
    const camera = this.dbs.camerasDB.get(cameraId);
    if (!camera) return;

    const key = SENSOR_TYPE_CONFIG[type].assignmentKey as keyof PluginAssignments;
    if (!Array.isArray(camera.assignments[key])) {
      (camera.assignments as Record<string, unknown>)[key] = [];
    }

    const assignments = camera.assignments[key] as AssignedPlugin[];
    if (assignments.some((p) => p.id === VIRTUAL_SENSOR_OWNER_ID)) return;

    assignments.push({ id: VIRTUAL_SENSOR_OWNER_ID, name: VIRTUAL_SENSOR_OWNER_NAME });
    await this.dbs.camerasDB.put(camera._id, camera);
    this.api.updateCamera(this.camerasService.transformCamera(camera));
  }

  private async removeAssignmentIfUnused(cameraId: string, type: SensorType): Promise<void> {
    const stillUsed = this.listByCamera(cameraId).some((record) => record.type === type);
    if (stillUsed) return;

    const camera = this.dbs.camerasDB.get(cameraId);
    if (!camera) return;

    const key = SENSOR_TYPE_CONFIG[type].assignmentKey as keyof PluginAssignments;
    const assignments = camera.assignments[key];
    if (!Array.isArray(assignments) || !assignments.some((p) => p.id === VIRTUAL_SENSOR_OWNER_ID)) return;

    (camera.assignments as Record<string, unknown>)[key] = assignments.filter((p) => p.id !== VIRTUAL_SENSOR_OWNER_ID);
    await this.dbs.camerasDB.put(camera._id, camera);
    this.api.updateCamera(this.camerasService.transformCamera(camera));
  }
}
