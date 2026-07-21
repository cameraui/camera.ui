import { isEqual, mergeWith } from '@camera.ui/common/utils';
import { canCreateCameras, isHub, PluginRole, SensorType } from '@camera.ui/sdk';
import { TTLCache } from '@isaacs/ttlcache';
import { container, delay, registry } from 'tsyringe';

import { getMultiProviderTypes, getSingleProviderTypes, getValidSensorTypes, SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_OWNER_ID } from '../../camera/sensors/types.js';
import { ConfigService } from '../../services/config/index.js';
import { applySourceUrlFlags, createSourceName, normalizeCameraName } from '../../utils/camera.js';
import { Database } from '../database/index.js';
import { PluginsService } from './plugins.service.js';
import { UsersService } from './users.service.js';

import type {
  AssignedPlugin,
  Camera,
  CameraInput,
  DetectionLine,
  DetectionZone,
  Go2RtcRTSPSource,
  Go2RtcSnapshotSource,
  Go2RtcWSSource,
  PluginContract,
  ProbeConfig,
} from '@camera.ui/sdk';
import type { CameraInputSettings } from '@camera.ui/sdk/internal';
import type { CameraUiAPI } from '../../api.js';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { CreateStreamData, Go2RTCProbe } from '../../go2rtc/types.js';
import type { DeepPartial } from '../../types.js';
import type { DBCamera } from '../database/types.js';

const VALID_SENSOR_TYPES: (SensorType | 'cameraController' | 'hub')[] = [...getValidSensorTypes(), 'cameraController', 'hub'];
const MULTI_PROVIDER_ASSIGNMENT_TYPES = new Set<string>([...getMultiProviderTypes(), 'hub']);

const cameraSourceProbeCache = new TTLCache<string, Go2RTCProbe>({ max: 100, ttl: Infinity });

const DEFAULT_EXTENSION_PLUGINS = ['@camera.ui/camera-ui-nvr'];

@registry([
  {
    token: 'dbs',
    useValue: delay(() => Database),
  },
])
export class CamerasService {
  private configService: ConfigService;
  private api: CameraUiAPI;
  private dbs: Database;
  private go2rtcApi: Go2RtcApi;
  private usersService: UsersService;
  private pluginsService: PluginsService;

  constructor() {
    this.configService = container.resolve<ConfigService>('configService');
    this.api = container.resolve<CameraUiAPI>('api');
    this.dbs = container.resolve<Database>('dbs');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');

    this.usersService = new UsersService();
    this.pluginsService = new PluginsService();
  }

  public async createCamera(cameraData: DBCamera): Promise<DBCamera> {
    if (this.findByConflictingName(cameraData.name)) {
      throw new Error(`Camera name "${cameraData.name}" is already in use`);
    }

    const plugin = this.pluginsService.getPluginById(cameraData.pluginInfo?.id ?? '');
    if (plugin) {
      if (!canCreateCameras(plugin.contract)) {
        throw new Error(`Plugin ${plugin.pluginName} is not allowed to create cameras.`);
      }

      const assignmentTypes = this.getAssignmentTypesFromContract(plugin.contract);
      const pluginExtension = { id: plugin.id, name: plugin.pluginName };

      if (!cameraData.plugins.some((p) => p.id === plugin.id)) {
        cameraData.plugins.push(pluginExtension);
      }

      for (const assignmentType of assignmentTypes) {
        if (this.isMultiProviderType(assignmentType)) {
          const key = assignmentType as keyof typeof cameraData.assignments;
          if (!Array.isArray(cameraData.assignments[key])) {
            (cameraData.assignments as Record<string, unknown>)[assignmentType] = [];
          }
          const arr = cameraData.assignments[key] as AssignedPlugin[];
          if (!arr.some((p) => p.id === plugin.id)) {
            arr.push(pluginExtension);
          }
        } else {
          (cameraData.assignments as Record<string, unknown>)[assignmentType] = pluginExtension;
        }
      }
    }

    await this.addCameraSourcesToConfig(cameraData._id, cameraData.name, cameraData.sources);

    await this.dbs.camerasDB.put(cameraData._id, cameraData);

    const transformedCamera = this.transformCamera(cameraData);
    await this.api.addCamera(transformedCamera);

    return (await this.activateDefaultExtensions(cameraData)) ?? cameraData;
  }

  public async patchZones(cameraname: string, zoneData: DetectionZone[]): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    if (!camera) return undefined;

    camera.detectionZones = zoneData;
    await this.dbs.camerasDB.put(camera._id, camera);
    this.api.updateCamera(this.transformCamera(camera));

    return camera;
  }

  public async patchLines(cameraname: string, lineData: DetectionLine[]): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    if (!camera) return undefined;

    camera.detectionLines = lineData;
    await this.dbs.camerasDB.put(camera._id, camera);
    this.api.updateCamera(this.transformCamera(camera));

    return camera;
  }

  public list(): DBCamera[] {
    return [...this.dbs.camerasDB.getRange()].map(({ value }) => this.migrateAssignments(value));
  }

  public listTransformed(): Camera[] {
    return this.list().map((camera) => this.transformCamera(camera));
  }

  // Called once at startup to remove references to uninstalled plugins
  public async cleanupNonExistentPlugins(): Promise<void> {
    const existingPluginNames = new Set<string>(this.pluginsService.listPlugins().map((p) => p.pluginName));
    const tasks: Promise<unknown>[] = [];

    for (const { value: camera } of this.dbs.camerasDB.getRange()) {
      let processedCamera = this.migrateAssignments(camera);

      const { camera: afterNonExistent, modified: mod1 } = this.cleanupPlugins(processedCamera, existingPluginNames);
      processedCamera = afterNonExistent;

      const { camera: afterDeselected, modified: mod2 } = this.cleanupDeselectedPluginAssignments(processedCamera);
      processedCamera = afterDeselected;

      if (mod1 || mod2) {
        tasks.push(this.dbs.camerasDB.put(processedCamera._id, processedCamera));
      }
    }

    await Promise.all(tasks);
  }

  public listByPluginId(pluginId: string): DBCamera[] {
    const result: DBCamera[] = [];
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value.pluginInfo?.id === pluginId) result.push(value);
    }
    return result;
  }

  public listTransformedByPluginId(pluginId: string): Camera[] {
    return this.listByPluginId(pluginId).map((c) => this.transformCamera(c));
  }

  public listByPlugin(pluginName: string): DBCamera[] {
    const result: DBCamera[] = [];
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value.plugins.some((p) => p.name === pluginName)) result.push(value);
    }
    return result;
  }

  public listTransformedByPlugin(pluginName: string): Camera[] {
    return this.listByPlugin(pluginName).map((c) => this.transformCamera(this.migrateAssignments(c)));
  }

  public listTransformedByAssignment(pluginName: string, assignmentTypes: (SensorType | 'cameraController' | 'hub')[]): Camera[] {
    const camerasMap = new Map<string, Camera>();

    for (const { value: camera } of this.dbs.camerasDB.getRange()) {
      for (const type of assignmentTypes) {
        const assignment = camera.assignments[type as keyof typeof camera.assignments];
        const matches = this.isMultiProviderType(type)
          ? Array.isArray(assignment) && assignment.some((p) => p.name === pluginName)
          : !!assignment && !Array.isArray(assignment) && assignment.name === pluginName;

        if (matches) {
          camerasMap.set(camera._id, this.transformCamera(this.migrateAssignments(camera)));
          break;
        }
      }
    }

    return [...camerasMap.values()];
  }

  public listTransformedByContract(pluginName: string, contract: PluginContract): Camera[] {
    const assignmentTypes = this.getAssignmentTypesFromContract(contract);
    return this.listTransformedByAssignment(pluginName, assignmentTypes);
  }

  public getRooms(): string[] {
    const seen = new Map<string, string>();
    for (const { value: camera } of this.dbs.camerasDB.getRange()) {
      const room = camera.room as string | undefined;
      if (room) {
        const key = room.toLowerCase();
        if (!seen.has(key)) seen.set(key, room);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  public findById(id: string): DBCamera | undefined {
    return this.dbs.camerasDB.get(id);
  }

  public findTransformedById(id: string): Camera | undefined {
    const camera = this.findById(id);
    return camera ? this.transformCamera(camera) : undefined;
  }

  public findByName(cameraname: string): DBCamera | undefined {
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value.name === cameraname) return value;
    }
    return undefined;
  }

  public findTransformedByName(cameraname: string): Camera | undefined {
    const camera = this.findByName(cameraname);
    return camera ? this.transformCamera(camera) : undefined;
  }

  public findByConflictingName(cameraname: string, excludeId?: string): DBCamera | undefined {
    const normalized = normalizeCameraName(cameraname);
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value._id !== excludeId && normalizeCameraName(value.name) === normalized) return value;
    }
    return undefined;
  }

  public availableName(base: string): string {
    if (!this.findByConflictingName(base)) return base;

    for (let i = 2; ; i++) {
      const candidate = `${base} ${i}`;
      if (!this.findByConflictingName(candidate)) return candidate;
    }
  }

  public findByPluginAndName(cameraname: string, pluginId: string): DBCamera | undefined {
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value.name === cameraname && value.pluginInfo?.id === pluginId) return value;
    }
    return undefined;
  }

  public findTransformedByPluginAndName(cameraname: string, pluginId: string): Camera | undefined {
    const camera = this.findByPluginAndName(cameraname, pluginId);
    return camera ? this.transformCamera(camera) : undefined;
  }

  public async patchCameraByName(cameraname: string, cameraData: DeepPartial<DBCamera>): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    if (!camera) return undefined;

    if (cameraData.name && this.findByConflictingName(cameraData.name, camera._id)) {
      throw new Error(`Camera name "${cameraData.name}" is already in use`);
    }

    const cameraController = this.api.getCamera(camera._id);
    const cameraOld = structuredClone(camera);

    const isInputSourceArray = (value: unknown) => Array.isArray(value) && value.every((item) => item && typeof item === 'object');

    mergeWith(camera, cameraData, (source: any[], target: any, key) => {
      if (key === 'sources' && isInputSourceArray(source) && isInputSourceArray(target)) {
        return (target as CameraInputSettings[]).map((srcItem) => {
          const objItem: CameraInputSettings | undefined = source.find((o: any) => o.name === srcItem.name);
          const sourceId = objItem?._id ?? srcItem._id;
          return objItem ? { ...objItem, ...srcItem, _id: sourceId, name: objItem.name } : srcItem;
        });
      }

      if (key === 'plugins' || key === 'assignments') {
        return source;
      }

      if (Array.isArray(source)) {
        return target;
      }
    });

    if (!isEqual(cameraOld, camera, true)) {
      if (cameraOld.name !== camera.name) {
        await this.removeCameraSourcesFromConfig(cameraOld.name, cameraOld.sources);
      }

      const orphanedSources = cameraOld.sources.filter((source) => !camera.sources.find((s) => s.name === source.name));
      await this.removeCameraSourcesFromConfig(camera.name, orphanedSources);
    }

    await this.addCameraSourcesToConfig(camera._id, camera.name, camera.sources);
    await this.dbs.camerasDB.put(camera._id, camera);

    // keep go2rtc's preload section in step with the disabled flag, a go2rtc
    // restart must not preload a disabled camera
    if (cameraOld.disabled !== camera.disabled) {
      this.dbs.syncCamerasToGo2RtcConfig();
    }

    if (!isEqual(cameraOld.sources, camera.sources, true)) {
      cameraController?.streamInfos.clear();
      for (const source of camera.sources) {
        cameraSourceProbeCache.delete(source._id);
      }
    }

    this.api.updateCamera(this.transformCamera(camera));

    return camera;
  }

  public async enableAssignmentByName(cameraname: string, pluginNameOrId: string, assignmentType: SensorType | 'cameraController'): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!camera || !plugin || !VALID_SENSOR_TYPES.includes(assignmentType) || !camera.plugins.some((p) => p.name === plugin.pluginName)) {
      return camera;
    }

    const pluginInfo = { id: plugin.id, name: plugin.pluginName };
    let mutated = false;

    if (this.isMultiProviderType(assignmentType)) {
      const key = assignmentType as keyof typeof camera.assignments;
      if (!Array.isArray(camera.assignments[key])) {
        (camera.assignments as Record<string, unknown>)[assignmentType] = [];
      }
      const arr = camera.assignments[key] as AssignedPlugin[];
      if (!arr.some((p) => p.name === plugin.pluginName)) {
        arr.push(pluginInfo);
        mutated = true;
      }
    } else {
      const currentAssignment = camera.assignments[assignmentType as keyof typeof camera.assignments];
      const currentName = currentAssignment && !Array.isArray(currentAssignment) ? currentAssignment.name : undefined;

      if (currentName !== plugin.pluginName) {
        (camera.assignments as Record<string, unknown>)[assignmentType] = pluginInfo;
        mutated = true;
      }
    }

    if (mutated) {
      await this.dbs.camerasDB.put(camera._id, camera);
      this.api.updateCamera(this.transformCamera(camera));
    }

    return camera;
  }

  public async disableAssignmentByName(cameraname: string, pluginNameOrId: string, assignmentType: SensorType | 'cameraController'): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!camera || !plugin || !VALID_SENSOR_TYPES.includes(assignmentType) || !camera.plugins.some((p) => p.name === plugin.pluginName)) {
      return camera;
    }

    let mutated = false;

    if (this.isMultiProviderType(assignmentType)) {
      const key = assignmentType as keyof typeof camera.assignments;
      const currentAssignments = camera.assignments[key];
      if (Array.isArray(currentAssignments) && currentAssignments.some((p) => p.name === plugin.pluginName)) {
        (camera.assignments as Record<string, unknown>)[assignmentType] = currentAssignments.filter((p) => p.name !== plugin.pluginName);
        mutated = true;
      }
    } else {
      const currentAssignment = camera.assignments[assignmentType as keyof typeof camera.assignments];
      const currentName = currentAssignment && !Array.isArray(currentAssignment) ? currentAssignment.name : undefined;

      if (currentName === plugin.pluginName) {
        (camera.assignments as Record<string, unknown>)[assignmentType] = undefined;
        mutated = true;
      }
    }

    if (mutated) {
      await this.dbs.camerasDB.put(camera._id, camera);
      this.api.updateCamera(this.transformCamera(camera));
    }

    return camera;
  }

  // All-in-one: add plugin and enable all its assignments (used by the "More" tab toggle)
  public async activatePluginByName(cameraname: string, pluginNameOrId: string): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!camera || !plugin) return camera;

    const isNewPlugin = !camera.plugins.some((p) => p.name === plugin.pluginName);
    const pluginInfo = { id: plugin.id, name: plugin.pluginName };

    if (isNewPlugin) {
      camera.plugins.push(pluginInfo);
    }

    const contract = plugin.contract;
    const assignmentTypes: (SensorType | 'hub')[] = contract.role === PluginRole.Hub ? ['hub'] : contract.provides;

    for (const assignmentType of assignmentTypes) {
      if (assignmentType === 'hub') {
        if (!Array.isArray(camera.assignments.hub)) {
          camera.assignments.hub = [];
        }
        if (!camera.assignments.hub.some((p) => p.name === plugin.pluginName)) {
          camera.assignments.hub.push(pluginInfo);
        }
      } else if (this.isMultiProviderType(assignmentType)) {
        const key = assignmentType as keyof typeof camera.assignments;
        if (!Array.isArray(camera.assignments[key])) {
          (camera.assignments as Record<string, unknown>)[assignmentType] = [];
        }
        const arr = camera.assignments[key] as AssignedPlugin[];
        if (!arr.some((p) => p.name === plugin.pluginName)) {
          arr.push(pluginInfo);
        }
      } else if (VALID_SENSOR_TYPES.includes(assignmentType)) {
        // only assign if not already assigned to another plugin
        const existing = (camera.assignments as Record<string, unknown>)[assignmentType] as AssignedPlugin | undefined;
        if (!existing?.name) {
          (camera.assignments as Record<string, unknown>)[assignmentType] = pluginInfo;
        }
      }
    }

    const transformedCamera = this.transformCamera(camera);
    await this.dbs.camerasDB.put(camera._id, camera);
    this.api.updateCamera(transformedCamera);

    if (isNewPlugin) {
      await this.api.selectCamera(plugin.id, transformedCamera);
    }

    return camera;
  }

  public async addPluginByName(cameraname: string, pluginNameOrId: string, _assignmentType: SensorType | 'cameraController' | 'hub'): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!camera || !plugin || camera.plugins.some((p) => p.name === plugin.pluginName)) {
      return camera;
    }

    camera.plugins.push({
      id: plugin.id,
      name: plugin.pluginName,
    });

    const transformedCamera = this.transformCamera(camera);
    await this.dbs.camerasDB.put(camera._id, camera);
    this.api.updateCamera(transformedCamera);

    // backend filters which sensors are shown based on assignments
    await this.api.selectCamera(plugin.id, transformedCamera);

    return camera;
  }

  public async removePluginByName(cameraname: string, pluginNameOrId: string): Promise<DBCamera | undefined> {
    const camera = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!camera || !plugin || !camera.plugins.some((p) => p.name === plugin.pluginName)) {
      return camera;
    }

    camera.plugins = camera.plugins.filter((p) => p.name !== plugin.pluginName);

    const singleProviderKeys = [...getSingleProviderTypes().map((type) => SENSOR_TYPE_CONFIG[type].assignmentKey), 'cameraController'];
    for (const key of singleProviderKeys) {
      const assignment = camera.assignments[key as keyof typeof camera.assignments];
      if (assignment && !Array.isArray(assignment) && assignment.name === plugin.pluginName) {
        (camera.assignments as Record<string, unknown>)[key] = undefined;
      }
    }

    for (const sensorType of [...getMultiProviderTypes(), 'hub']) {
      const key = sensorType === 'hub' ? 'hub' : SENSOR_TYPE_CONFIG[sensorType as SensorType].assignmentKey;
      const assignments = camera.assignments[key as keyof typeof camera.assignments];
      if (Array.isArray(assignments)) {
        (camera.assignments as Record<string, unknown>)[key] = assignments.filter((p) => p.name !== plugin.pluginName);
      }
    }

    const transformedCamera = this.transformCamera(camera);

    await this.dbs.camerasDB.put(camera._id, camera);

    await this.api.deselectCamera(plugin.id, transformedCamera);

    this.api.updateCamera(transformedCamera);

    return camera;
  }

  public async removePluginAssignments(pluginNameOrId: string, assignmentType: SensorType | 'cameraController' | 'hub'): Promise<void> {
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);
    if (!plugin) return;

    for (const { value: camera } of this.dbs.camerasDB.getRange()) {
      if (!camera.plugins.some((p) => p.name === plugin.pluginName)) continue;

      camera.plugins = camera.plugins.filter((p) => p.name !== plugin.pluginName);

      if (this.isMultiProviderType(assignmentType)) {
        const key = assignmentType as keyof typeof camera.assignments;
        const currentAssignments = camera.assignments[key];
        if (Array.isArray(currentAssignments)) {
          (camera.assignments as Record<string, unknown>)[assignmentType] = currentAssignments.filter((p) => p.name !== plugin.pluginName);
        }
      } else {
        const assignment = camera.assignments[assignmentType as keyof typeof camera.assignments];
        if (assignment && !Array.isArray(assignment) && assignment.name === plugin.pluginName) {
          (camera.assignments as Record<string, unknown>)[assignmentType] = undefined;
        }
      }

      const transformedCamera = this.transformCamera(camera);
      await this.dbs.camerasDB.put(camera._id, camera);

      await this.api.deselectCamera(plugin.id, transformedCamera);

      this.api.updateCamera(transformedCamera);
    }
  }

  public async removeByName(cameraname: string): Promise<void> {
    const camera = this.findByName(cameraname);
    if (camera) await this.removeOne(camera);
  }

  public async removeById(id: string): Promise<void> {
    const camera = this.findById(id);
    if (camera) await this.removeOne(camera);
  }

  public async removeByPluginName(pluginName: string): Promise<void> {
    const plugin = this.pluginsService.getPluginDbByName(pluginName);
    if (plugin) {
      await this.removeByPluginId(plugin._id);
    }
  }

  public async removeByPluginId(pluginId: string): Promise<void> {
    let target: DBCamera | undefined;
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value.pluginInfo?.id === pluginId) {
        target = value;
        break;
      }
    }
    if (target) await this.removeOne(target);
  }

  public async removeByPluginIdAndName(cameraname: string, pluginId: string): Promise<void> {
    const camera = this.findByPluginAndName(cameraname, pluginId);
    if (camera) await this.removeOne(camera);
  }

  public async removeAll(): Promise<void> {
    const camerasToRemove = [...this.dbs.camerasDB.getRange()].map(({ value }) => value);

    cameraSourceProbeCache.clear();
    await this.usersService.resetAllPreferences();
    await this.dbs.camerasDB.clearAsync();
    await Promise.all(camerasToRemove.map((camera) => this.removeCameraSourcesFromConfig(camera.name, camera.sources)));
    await Promise.all(camerasToRemove.map((camera) => this.api.removeCamera(this.transformCamera(camera), camera.assignments)));
  }

  public listByAgentId(agentId: string): DBCamera[] {
    const result: DBCamera[] = [];
    for (const { value } of this.dbs.camerasDB.getRange()) {
      if (value.workerAgentId === agentId) result.push(value);
    }
    return result;
  }

  public async setWorkerAgentId(cameraId: string, agentId: string | undefined): Promise<DBCamera | undefined> {
    const camera = this.findById(cameraId);
    if (!camera) return undefined;

    camera.workerAgentId = agentId;
    await this.dbs.camerasDB.put(camera._id, camera);
    return camera;
  }

  public async streamSourceInfo(camera: DBCamera, source: CameraInput): Promise<Go2RTCProbe | undefined> {
    const src = createSourceName(camera.name, source.name);
    return this.go2rtcApi.streamsRoute.getStreamInfo({ src });
  }

  public async probeCameraSource(camera: DBCamera, source: CameraInput, probeData?: ProbeConfig, force = false): Promise<Go2RTCProbe> {
    const src = createSourceName(camera.name, source.name);

    const live = await this.go2rtcApi.streamsRoute.getStreamInfo({ src }).catch(() => undefined);
    const liveHasCodecs = live?.producers?.some((p) => (p.receivers?.length ?? 0) > 0) ?? false;
    if (!force && live && liveHasCodecs) {
      return live;
    }

    let probe = force ? undefined : cameraSourceProbeCache.get(source._id);
    if (!probe) {
      probe = await this.go2rtcApi.streamsRoute.probeStreamSource({ src }, probeData);
      cameraSourceProbeCache.set(source._id, probe);
    }

    return { producers: probe.producers, consumers: live?.consumers ?? [] };
  }

  public transformCamera(camera: DBCamera): Camera {
    const transformedCamera: Camera = {
      ...camera,
      sources: camera.sources.map((source) => ({
        _id: source._id,
        name: source.name,
        role: source.role,
        useForSnapshot: source.useForSnapshot,
        hotMode: source.hotMode,
        preload: source.preload,
        muted: source.muted,
        childSourceId: source.childSourceId,
        urls: {
          ws: this.generateWsUrls(camera, source),
          rtsp: this.generateRTSPUrls(camera, source),
          snapshot: this.generateSnapshotUrls(camera, source),
        },
        ...(source.role !== 'snapshot' ? { homekitUrls: {
          ws: this.generateWsUrls(camera, { ...source, name: `${source.name}_homekit` }),
          rtsp: this.generateRTSPUrls(camera, { ...source, name: `${source.name}_homekit` }),
          snapshot: this.generateSnapshotUrls(camera, { ...source, name: `${source.name}_homekit` }),
        } } : {}),
      })),
    };

    return transformedCamera;
  }

  private async activateDefaultExtensions(camera: DBCamera): Promise<DBCamera | undefined> {
    let updated: DBCamera | undefined;
    for (const pluginName of DEFAULT_EXTENSION_PLUGINS) {
      const plugin = this.pluginsService.getPluginByName(pluginName);
      if (!plugin || plugin.disabled || camera.plugins.some((p) => p.id === plugin.id)) {
        continue;
      }
      updated = (await this.activatePluginByName(camera.name, pluginName).catch(() => undefined)) ?? updated;
    }
    return updated;
  }

  private async removeOne(camera: DBCamera): Promise<void> {
    for (const source of camera.sources) {
      cameraSourceProbeCache.delete(source._id);
    }

    await this.usersService.removeCameraFromPreferences(camera._id);
    await this.dbs.camerasDB.remove(camera._id);
    await this.removeCameraSourcesFromConfig(camera.name, camera.sources);
    await this.api.removeCamera(this.transformCamera(camera), camera.assignments);
  }

  private async addCameraSourcesToConfig(cameraId: string, cameraname: string, sources: CameraInputSettings[]): Promise<void> {
    for (const source of sources) {
      source.urls = source.urls.map((url) => {
        if (url.startsWith('cui://')) {
          url = `cui://127.0.0.1:${this.configService.config.port}/api/cameras/streams/${cameraId}/${source.name}`;
        }
        return applySourceUrlFlags(url, source);
      });

      const sourceName = createSourceName(cameraname, source.name);
      const ffmpegUrl = `ffmpeg:${sourceName}#cameraui#audio=pcma#audio=opus#audio=aac#noVideo#noBackchannel#requirePrevAudio`;
      const homekitSourceName = `${sourceName}_homekit`;
      const homekitUrl = `ffmpeg:${sourceName}#cameraui#video=h264#hardware#audio=pcma#audio=opus#audio=aac#noBackchannel#requirePrevAudio`;
      let baseUrls = [...source.urls];

      const isCompanionUrl = (url: string): boolean => url.startsWith('ffmpeg:') && url.includes('#cameraui');
      const hasFFmpegUrl = baseUrls.some(isCompanionUrl);
      if (source.muted) {
        baseUrls = baseUrls.filter((url) => !isCompanionUrl(url));
      } else if (!hasFFmpegUrl && source.role !== 'snapshot') {
        baseUrls.push(ffmpegUrl);
      } else if (hasFFmpegUrl) {
        baseUrls = baseUrls.map((url) => (isCompanionUrl(url) ? ffmpegUrl : url));
      }

      const cameraSource: CreateStreamData = {
        name: sourceName,
        src: baseUrls,
      };

      if (!this.sourcesAreEqual(sourceName, baseUrls)) {
        this.configService.go2rtcConfig.streams ??= {};

        await this.go2rtcApi.streamsRoute.createStream({
          name: cameraSource.name,
          src: cameraSource.src,
        });

        this.configService.go2rtcConfig.streams[cameraSource.name] = cameraSource.src;
      }
      if (source.role !== 'snapshot') {
        const homekitSource = [homekitUrl];
        if (!this.sourcesAreEqual(homekitSourceName, homekitSource)) {
          await this.go2rtcApi.streamsRoute.createStream({ name: homekitSourceName, src: homekitSource });
          this.configService.go2rtcConfig.streams[homekitSourceName] = homekitSource;
        }
      } else if (this.configService.go2rtcConfig.streams?.[homekitSourceName]) {
        delete this.configService.go2rtcConfig.streams[homekitSourceName];
      }
    }
  }

  private async removeCameraSourcesFromConfig(cameraname: string, oldSources: CameraInputSettings[]): Promise<void> {
    for (const source of oldSources) {
      const sourceName = createSourceName(cameraname, source.name);
      const sourcesToRemove: string[] = [];
      const preloadsToRemove: string[] = [];

      if (this.configService.go2rtcConfig.streams?.[sourceName]) {
        sourcesToRemove.push(sourceName);
      }
      const homekitSourceName = `${sourceName}_homekit`;
      if (this.configService.go2rtcConfig.streams?.[homekitSourceName]) {
        sourcesToRemove.push(homekitSourceName);
      }

      if (this.configService.go2rtcConfig.preload?.[sourceName]) {
        preloadsToRemove.push(sourceName);
      }
      if (this.configService.go2rtcConfig.preload?.[homekitSourceName]) {
        preloadsToRemove.push(homekitSourceName);
      }

      this.configService.go2rtcConfig.streams ??= {};
      this.configService.go2rtcConfig.preload ??= {};

      for (const src of preloadsToRemove) {
        await this.go2rtcApi.streamsRoute.deletePreloadStream({ src });
        delete this.configService.go2rtcConfig.preload?.[src];
      }

      for (const src of sourcesToRemove) {
        await this.go2rtcApi.streamsRoute.deleteStream({ src });
        delete this.configService.go2rtcConfig.streams?.[src];
      }

      let rewriteConfig = false;

      if (Object.keys(this.configService.go2rtcConfig.preload).length === 0) {
        delete this.configService.go2rtcConfig.preload;
        rewriteConfig = true;
      }

      if (Object.keys(this.configService.go2rtcConfig.streams).length === 0) {
        delete this.configService.go2rtcConfig.streams;
        rewriteConfig = true;
      }

      if (rewriteConfig) {
        await this.configService.writeGo2RtcConfigApi();
      }
    }
  }

  private sourcesAreEqual(sourceName: string, source: string[]): boolean {
    if (this.configService.go2rtcConfig.streams?.[sourceName]) {
      let configSource = this.configService.go2rtcConfig.streams[sourceName];
      configSource = typeof configSource === 'string' ? [configSource] : configSource;
      return isEqual(configSource, source, true);
    }

    return false;
  }

  private generateWsUrls(camera: DBCamera, source: CameraInputSettings): Go2RtcWSSource {
    const sourceName = createSourceName(camera.name, source.name);
    const go2rtcAddress = this.configService.go2rtcAddress('ws');
    const baseWebRtcUrl = `${go2rtcAddress}/api/ws?src=${sourceName}`;

    return {
      webrtc: baseWebRtcUrl,
      mse: baseWebRtcUrl,
    };
  }

  private generateRTSPUrls(camera: DBCamera, source: CameraInputSettings): Go2RtcRTSPSource {
    const sourceName = createSourceName(camera.name, source.name);
    const go2rtcAddress = this.configService.go2rtcAddress('rtsp');
    const onvifAddress = this.configService.go2rtcAddress('onvif');
    const baseRtspUrl = `${go2rtcAddress}/${sourceName}`;
    const baseOnvifUrl = `${onvifAddress}/${sourceName}`;

    return {
      base: `${baseRtspUrl}?video&audio&timeout=15`,
      default: `${baseRtspUrl}?video&audio&backchannel=opus,pcma,pcmu&timeout=15`,
      muted: `${baseRtspUrl}?video&timeout=15`,
      audioOnly: `${baseRtspUrl}?audio&timeout=15`,
      aac: `${baseRtspUrl}?video&audio=aac&backchannel=opus,pcma,pcmu&timeout=15`,
      opus: `${baseRtspUrl}?video&audio=opus&backchannel=opus,pcma,pcmu&timeout=15`,
      pcma: `${baseRtspUrl}?video&audio=pcma&backchannel=opus,pcma,pcmu&timeout=15`,
      noGop: `${baseRtspUrl}?video&audio&timeout=15&gop=0`,
      onvif: baseOnvifUrl,
    };
  }

  private generateSnapshotUrls(camera: DBCamera, source: CameraInputSettings): Go2RtcSnapshotSource {
    const sourceName = createSourceName(camera.name, source.name);
    const go2rtcAddress = this.configService.go2rtcAddress('api');
    const baseMjpegStreamUrl = `${go2rtcAddress}/api/stream.mjpeg?src=${sourceName}`;
    const baseFrameMp4StreamUrl = `${go2rtcAddress}/api/frame.mp4?src=${sourceName}`;
    const baseFrameJpegStreamUrl = `${go2rtcAddress}/api/frame.jpeg?src=${sourceName}`;

    return {
      mp4: baseFrameMp4StreamUrl,
      jpeg: baseFrameJpegStreamUrl,
      mjpeg: baseMjpegStreamUrl,
    };
  }

  private isMultiProviderType(type: string): boolean {
    return MULTI_PROVIDER_ASSIGNMENT_TYPES.has(type);
  }

  private migrateAssignments(camera: DBCamera): DBCamera {
    if (!camera.assignments) {
      camera.assignments = {};
      return camera;
    }

    const arrayTypes = getMultiProviderTypes().map((type) => SENSOR_TYPE_CONFIG[type].assignmentKey);

    for (const type of arrayTypes) {
      const assignment = camera.assignments[type as keyof typeof camera.assignments];
      if (assignment && !Array.isArray(assignment)) {
        (camera.assignments as Record<string, unknown>)[type] = [assignment];
      }
    }

    return camera;
  }

  private cleanupDeselectedPluginAssignments(camera: DBCamera): { camera: DBCamera; modified: boolean } {
    let modified = false;

    const selectedPluginNames = new Set(camera.plugins.map((p) => p.name));

    if (camera.assignments) {
      for (const key of Object.keys(camera.assignments)) {
        const assignment = camera.assignments[key as keyof typeof camera.assignments];

        if (Array.isArray(assignment)) {
          const originalLength = assignment.length;
          const filtered = assignment.filter((p) => selectedPluginNames.has(p.name) || p.id === VIRTUAL_SENSOR_OWNER_ID);
          if (filtered.length !== originalLength) {
            (camera.assignments as Record<string, unknown>)[key] = filtered;
            modified = true;
          }
        } else if (assignment && typeof assignment === 'object' && 'name' in assignment) {
          if (!selectedPluginNames.has(assignment.name)) {
            (camera.assignments as Record<string, unknown>)[key] = undefined;
            modified = true;
          }
        }
      }
    }

    return { camera, modified };
  }

  private cleanupPlugins(camera: DBCamera, existingPluginNames: Set<string>): { camera: DBCamera; modified: boolean } {
    let modified = false;

    const originalPluginsLength = camera.plugins.length;
    camera.plugins = camera.plugins.filter((p) => existingPluginNames.has(p.name));
    if (camera.plugins.length !== originalPluginsLength) {
      modified = true;
    }

    if (camera.assignments) {
      for (const key of Object.keys(camera.assignments)) {
        const assignment = camera.assignments[key as keyof typeof camera.assignments];

        if (Array.isArray(assignment)) {
          const originalLength = assignment.length;
          const filtered = assignment.filter((p) => existingPluginNames.has(p.name) || p.id === VIRTUAL_SENSOR_OWNER_ID);
          if (filtered.length !== originalLength) {
            (camera.assignments as Record<string, unknown>)[key] = filtered;
            modified = true;
          }
        } else if (assignment && typeof assignment === 'object' && 'name' in assignment) {
          if (!existingPluginNames.has(assignment.name)) {
            (camera.assignments as Record<string, unknown>)[key] = undefined;
            modified = true;
          }
        }
      }
    }

    return { camera, modified };
  }

  private getAssignmentTypesFromContract(contract: PluginContract): (SensorType | 'cameraController' | 'hub')[] {
    const types: (SensorType | 'cameraController' | 'hub')[] = [];

    for (const sensorType of contract.provides) {
      types.push(sensorType);
    }

    if (isHub(contract)) {
      types.push('hub');
    }

    if (canCreateCameras(contract)) {
      types.push('cameraController');
    }

    return types;
  }
}
