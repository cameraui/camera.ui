import { isEqual, mergeWith } from '@camera.ui/common/utils';
import { canCreateCameras, isHub, PluginRole, SensorType } from '@camera.ui/sdk';
import { TTLCache } from '@isaacs/ttlcache';
import { container, delay, registry } from 'tsyringe';

import { clearSourceCodecInfos, deleteSourceCodecInfo, getSourceCodecInfo } from '../../camera/codecCache.js';
import { getMultiProviderTypes, getSingleProviderTypes, getValidSensorTypes, SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_OWNER_ID } from '../../sensors/types.js';
import { ConfigService } from '../../services/config/index.js';
import { createSourceName, generatedSourceUrls, go2rtcStreamUrls, normalizeCameraName } from '../../utils/camera.js';
import { Database } from '../database/index.js';
import { FloorPlanService } from './floorplan.service.js';
import { PluginsService } from './plugins.service.js';
import { RoomsService } from './rooms.service.js';
import { UsersService } from './users.service.js';

import type {
  AssignedPlugin,
  Camera,
  CameraInput,
  CameraZones,
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
import type { SensorRegistry } from '../../sensors/registry.js';
import type { DeepPartial } from '../../types.js';
import type { DBCamera } from '../database/types.js';

const VALID_SENSOR_TYPES: (SensorType | 'cameraController' | 'hub')[] = [...getValidSensorTypes(), 'cameraController', 'hub'];
const MULTI_PROVIDER_ASSIGNMENT_TYPES = new Set<string>([...getMultiProviderTypes(), 'hub']);

const cameraSourceProbeCache = new TTLCache<string, Go2RTCProbe>({ max: 100, ttl: Infinity });

const DEFAULT_EXTENSION_PLUGINS = ['@camera.ui/camera-ui-nvr'];

const pluginSourceTimeoutSeconds = 60;

function withSourceTransportDefaults<T extends { urls: string[]; timeout?: number }>(source: T): T {
  if (source.timeout || !source.urls.some((url) => url.startsWith('cui://'))) {
    return source;
  }
  return { ...source, timeout: pluginSourceTimeoutSeconds };
}

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
  private floorPlanService: FloorPlanService;
  private roomsService: RoomsService;

  constructor() {
    this.configService = container.resolve<ConfigService>('configService');
    this.api = container.resolve<CameraUiAPI>('api');
    this.dbs = container.resolve<Database>('dbs');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');

    this.usersService = new UsersService();
    this.pluginsService = new PluginsService();
    this.floorPlanService = new FloorPlanService();
    this.roomsService = new RoomsService();
  }

  public async createCamera(cameraData: DBCamera): Promise<DBCamera> {
    await this.resolveRoom(cameraData);

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

    cameraData.sources = cameraData.sources.map(withSourceTransportDefaults);

    await this.addCameraSourcesToConfig(cameraData._id, cameraData.name, cameraData.sources);

    await this.dbs.camerasDB.put(cameraData._id, cameraData);

    const transformedCamera = this.transformCamera(cameraData);
    await this.api.addCamera(transformedCamera);

    return (await this.activateDefaultExtensions(cameraData)) ?? cameraData;
  }

  public async patchZoneConfig(cameraname: string, zones: CameraZones): Promise<DBCamera | undefined> {
    const existing = this.findByName(cameraname);
    if (!existing) return undefined;

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current) return undefined;

      current.zones = zones;

      return current;
    });
    if (!camera) return undefined;

    this.api.updateCamera(this.transformCamera(camera));

    return camera;
  }

  public list(): DBCamera[] {
    return [...this.dbs.camerasDB.getRange()].map(({ value }) => this.migrateAssignments(value));
  }

  public listTransformed(): Camera[] {
    return this.list().map((camera) => this.transformCamera(camera));
  }

  public async cleanupNonExistentPlugins(): Promise<void> {
    const existingPluginNames = new Set<string>(this.pluginsService.listPlugins().map((p) => p.pluginName));
    const cameraIds = [...this.dbs.camerasDB.getRange()].map(({ value }) => value._id);

    await Promise.all(
      cameraIds.map((cameraId) =>
        this.dbs.commit(this.dbs.camerasDB, cameraId, (current) => {
          if (!current) return undefined;

          let processedCamera = this.migrateAssignments(current);

          const { camera: afterNonExistent, modified: mod1 } = this.cleanupPlugins(processedCamera, existingPluginNames);
          processedCamera = afterNonExistent;

          const { camera: afterDeselected, modified: mod2 } = this.cleanupDeselectedPluginAssignments(processedCamera);
          processedCamera = afterDeselected;

          return mod1 || mod2 ? processedCamera : undefined;
        }),
      ),
    );
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
    return [...this.roomsService.labels().values()].sort((a, b) => a.localeCompare(b));
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
    const existing = this.findByName(cameraname);
    if (!existing) return undefined;

    const roomPatch = cameraData as { room?: string; roomId?: string | null };
    if (roomPatch.room !== undefined || roomPatch.roomId !== undefined) {
      await this.resolveRoom(roomPatch);
    }

    if (cameraData.name && this.findByConflictingName(cameraData.name, existing._id)) {
      throw new Error(`Camera name "${cameraData.name}" is already in use`);
    }

    const cameraController = this.api.getCamera(existing._id);
    const cameraOld = structuredClone(existing);

    const isInputSourceArray = (value: unknown) => Array.isArray(value) && value.every((item) => item && typeof item === 'object');

    const applyPatch = (target: DBCamera): void => {
      mergeWith(target, cameraData, (source: any[], mergeTarget: any, key) => {
        if (key === 'sources' && isInputSourceArray(source) && isInputSourceArray(mergeTarget)) {
          return (mergeTarget as CameraInputSettings[]).map((srcItem) => {
            const objItem: CameraInputSettings | undefined = source.find((o: any) => o.name === srcItem.name);
            const sourceId = objItem?._id ?? srcItem._id;
            return withSourceTransportDefaults(objItem ? { ...objItem, ...srcItem, _id: sourceId, name: objItem.name } : srcItem);
          });
        }

        if (key === 'plugins' || key === 'assignments') {
          return source;
        }

        if (Array.isArray(source)) {
          return mergeTarget;
        }
      });
    };

    const patched = structuredClone(existing);
    applyPatch(patched);

    if (!isEqual(cameraOld, patched, true)) {
      if (cameraOld.name !== patched.name) {
        await this.removeCameraSourcesFromConfig(cameraOld.name, cameraOld.sources);
      }

      const orphanedSources = cameraOld.sources.filter((source) => !patched.sources.find((s) => s.name === source.name));
      await this.removeCameraSourcesFromConfig(patched.name, orphanedSources);
    }

    await this.addCameraSourcesToConfig(patched._id, patched.name, patched.sources);

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current) return undefined;

      applyPatch(current);

      return current;
    });
    if (!camera) return undefined;

    if (cameraOld.disabled !== camera.disabled) {
      this.dbs.syncCamerasToGo2RtcConfig();
    }

    if (!isEqual(cameraOld.sources, camera.sources, true)) {
      cameraController?.streamInfos.clear();
      for (const source of camera.sources) {
        cameraSourceProbeCache.delete(source._id);
        deleteSourceCodecInfo(source._id);
      }
    }

    this.api.updateCamera(this.transformCamera(camera));

    return camera;
  }

  public async enableAssignmentByName(cameraname: string, pluginNameOrId: string, assignmentType: SensorType | 'cameraController'): Promise<DBCamera | undefined> {
    const existing = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!existing || !plugin || !VALID_SENSOR_TYPES.includes(assignmentType) || !existing.plugins.some((p) => p.name === plugin.pluginName)) {
      return existing;
    }

    const pluginInfo = { id: plugin.id, name: plugin.pluginName };

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current) return undefined;

      let mutated = false;

      if (this.isMultiProviderType(assignmentType)) {
        const key = assignmentType as keyof typeof current.assignments;
        if (!Array.isArray(current.assignments[key])) {
          (current.assignments as Record<string, unknown>)[assignmentType] = [];
        }
        const arr = current.assignments[key] as AssignedPlugin[];
        if (!arr.some((p) => p.name === plugin.pluginName)) {
          arr.push(pluginInfo);
          mutated = true;
        }
      } else {
        const currentAssignment = current.assignments[assignmentType as keyof typeof current.assignments];
        const currentName = currentAssignment && !Array.isArray(currentAssignment) ? currentAssignment.name : undefined;

        if (currentName !== plugin.pluginName) {
          (current.assignments as Record<string, unknown>)[assignmentType] = pluginInfo;
          mutated = true;
        }
      }

      if (this.clearInvalidObjectAssist(current)) {
        mutated = true;
      }

      return mutated ? current : undefined;
    });

    if (camera) {
      this.api.updateCamera(this.transformCamera(camera));
    }

    return camera ?? existing;
  }

  public async disableAssignmentByName(cameraname: string, pluginNameOrId: string, assignmentType: SensorType | 'cameraController'): Promise<DBCamera | undefined> {
    const existing = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!existing || !plugin || !VALID_SENSOR_TYPES.includes(assignmentType) || !existing.plugins.some((p) => p.name === plugin.pluginName)) {
      return existing;
    }

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current) return undefined;

      let mutated = false;

      if (this.isMultiProviderType(assignmentType)) {
        const key = assignmentType as keyof typeof current.assignments;
        const currentAssignments = current.assignments[key];
        if (Array.isArray(currentAssignments) && currentAssignments.some((p) => p.name === plugin.pluginName)) {
          (current.assignments as Record<string, unknown>)[assignmentType] = currentAssignments.filter((p) => p.name !== plugin.pluginName);
          mutated = true;
        }
      } else {
        const currentAssignment = current.assignments[assignmentType as keyof typeof current.assignments];
        const currentName = currentAssignment && !Array.isArray(currentAssignment) ? currentAssignment.name : undefined;

        if (currentName === plugin.pluginName) {
          (current.assignments as Record<string, unknown>)[assignmentType] = undefined;
          mutated = true;
        }
      }

      if (this.clearInvalidObjectAssist(current)) {
        mutated = true;
      }

      return mutated ? current : undefined;
    });

    if (camera) {
      this.api.updateCamera(this.transformCamera(camera));
    }

    return camera ?? existing;
  }

  public async activatePluginByName(cameraname: string, pluginNameOrId: string): Promise<DBCamera | undefined> {
    const existing = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!existing || !plugin) return existing;

    const isNewPlugin = !existing.plugins.some((p) => p.name === plugin.pluginName);
    const pluginInfo = { id: plugin.id, name: plugin.pluginName };

    const contract = plugin.contract;
    const assignmentTypes: (SensorType | 'hub')[] = contract.role === PluginRole.Hub ? ['hub'] : contract.provides;

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current) return undefined;

      if (!current.plugins.some((p) => p.name === plugin.pluginName)) {
        current.plugins.push(pluginInfo);
      }

      for (const assignmentType of assignmentTypes) {
        if (assignmentType === 'hub') {
          if (!Array.isArray(current.assignments.hub)) {
            current.assignments.hub = [];
          }
          if (!current.assignments.hub.some((p) => p.name === plugin.pluginName)) {
            current.assignments.hub.push(pluginInfo);
          }
        } else if (this.isMultiProviderType(assignmentType)) {
          const key = assignmentType as keyof typeof current.assignments;
          if (!Array.isArray(current.assignments[key])) {
            (current.assignments as Record<string, unknown>)[assignmentType] = [];
          }
          const arr = current.assignments[key] as AssignedPlugin[];
          if (!arr.some((p) => p.name === plugin.pluginName)) {
            arr.push(pluginInfo);
          }
        } else if (VALID_SENSOR_TYPES.includes(assignmentType)) {
          // only assign if not already assigned to another plugin
          const assigned = (current.assignments as Record<string, unknown>)[assignmentType] as AssignedPlugin | undefined;
          if (!assigned?.name) {
            (current.assignments as Record<string, unknown>)[assignmentType] = pluginInfo;
          }
        }
      }

      this.clearInvalidObjectAssist(current);

      return current;
    });
    if (!camera) return undefined;

    const transformedCamera = this.transformCamera(camera);
    this.api.updateCamera(transformedCamera);

    if (isNewPlugin) {
      await this.api.selectCamera(plugin.id, transformedCamera);
    }

    return camera;
  }

  public async addPluginByName(cameraname: string, pluginNameOrId: string, _assignmentType: SensorType | 'cameraController' | 'hub'): Promise<DBCamera | undefined> {
    const existing = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!existing || !plugin || existing.plugins.some((p) => p.name === plugin.pluginName)) {
      return existing;
    }

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current || current.plugins.some((p) => p.name === plugin.pluginName)) return undefined;

      current.plugins.push({
        id: plugin.id,
        name: plugin.pluginName,
      });

      return current;
    });
    if (!camera) return existing;

    const transformedCamera = this.transformCamera(camera);
    this.api.updateCamera(transformedCamera);

    // backend filters which sensors are shown based on assignments
    await this.api.selectCamera(plugin.id, transformedCamera);

    return camera;
  }

  public async removePluginByName(cameraname: string, pluginNameOrId: string): Promise<DBCamera | undefined> {
    const existing = this.findByName(cameraname);
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);

    if (!existing || !plugin || !existing.plugins.some((p) => p.name === plugin.pluginName)) {
      return existing;
    }

    const camera = await this.dbs.commit(this.dbs.camerasDB, existing._id, (current) => {
      if (!current) return undefined;

      current.plugins = current.plugins.filter((p) => p.name !== plugin.pluginName);

      const singleProviderKeys = [...getSingleProviderTypes().map((type) => SENSOR_TYPE_CONFIG[type].assignmentKey), 'cameraController'];
      for (const key of singleProviderKeys) {
        const assignment = current.assignments[key as keyof typeof current.assignments];
        if (assignment && !Array.isArray(assignment) && assignment.name === plugin.pluginName) {
          (current.assignments as Record<string, unknown>)[key] = undefined;
        }
      }

      for (const sensorType of [...getMultiProviderTypes(), 'hub']) {
        const key = sensorType === 'hub' ? 'hub' : SENSOR_TYPE_CONFIG[sensorType as SensorType].assignmentKey;
        const assignments = current.assignments[key as keyof typeof current.assignments];
        if (Array.isArray(assignments)) {
          (current.assignments as Record<string, unknown>)[key] = assignments.filter((p) => p.name !== plugin.pluginName);
        }
      }

      this.clearInvalidObjectAssist(current);

      return current;
    });
    if (!camera) return undefined;

    const transformedCamera = this.transformCamera(camera);

    await this.api.deselectCamera(plugin.id, transformedCamera);

    this.api.updateCamera(transformedCamera);

    return camera;
  }

  public async removePluginAssignments(pluginNameOrId: string, assignmentType: SensorType | 'cameraController' | 'hub'): Promise<void> {
    const plugin = this.pluginsService.getPluginByName(pluginNameOrId) ?? this.pluginsService.getPluginById(pluginNameOrId);
    if (!plugin) return;

    const affected = [...this.dbs.camerasDB.getRange()].filter(({ value }) => value.plugins.some((p) => p.name === plugin.pluginName)).map(({ value }) => value._id);

    for (const cameraId of affected) {
      const camera = await this.dbs.commit(this.dbs.camerasDB, cameraId, (current) => {
        if (!current) return undefined;

        current.plugins = current.plugins.filter((p) => p.name !== plugin.pluginName);

        if (this.isMultiProviderType(assignmentType)) {
          const key = assignmentType as keyof typeof current.assignments;
          const currentAssignments = current.assignments[key];
          if (Array.isArray(currentAssignments)) {
            (current.assignments as Record<string, unknown>)[assignmentType] = currentAssignments.filter((p) => p.name !== plugin.pluginName);
          }
        } else {
          const assignment = current.assignments[assignmentType as keyof typeof current.assignments];
          if (assignment && !Array.isArray(assignment) && assignment.name === plugin.pluginName) {
            (current.assignments as Record<string, unknown>)[assignmentType] = undefined;
          }
        }

        return current;
      });
      if (!camera) continue;

      const transformedCamera = this.transformCamera(camera);

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
    clearSourceCodecInfos();
    await this.usersService.resetAllPreferences();
    await this.floorPlanService.dropCameras(camerasToRemove.map((camera) => camera._id));
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
    return this.dbs.commit(this.dbs.camerasDB, cameraId, (current) => {
      if (!current) return undefined;

      current.workerAgentId = agentId;

      return current;
    });
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
    const { roomId, ...rest } = camera;

    const transformedCamera: Camera = {
      ...rest,
      room: this.roomsService.label(roomId) ?? camera.room,
      sources: rest.sources.map((source) => ({
        _id: source._id,
        name: source.name,
        role: source.role,
        useForSnapshot: source.useForSnapshot,
        hotMode: source.hotMode,
        preload: source.preload,
        muted: source.muted,
        backchannelDisabled: source.backchannelDisabled,
        timeout: source.timeout,
        handshakeTimeout: source.handshakeTimeout,
        ...getSourceCodecInfo(source._id),
        childSourceId: source.childSourceId,
        urls: {
          ws: this.generateWsUrls(camera, source),
          rtsp: this.generateRTSPUrls(camera, source),
          snapshot: this.generateSnapshotUrls(camera, source),
        },
      })),
    };

    return transformedCamera;
  }

  public async assignRoom(cameraId: string, roomId: string): Promise<void> {
    const label = this.roomsService.label(roomId);
    if (!label) return;

    const camera = await this.dbs.commit(this.dbs.camerasDB, cameraId, (current) => {
      if (!current || (current.roomId === roomId && current.room === label)) return undefined;

      current.roomId = roomId;
      current.room = label;

      return current;
    });
    if (!camera) return;

    this.api.updateCamera(this.transformCamera(camera));
  }

  public async resolveRoom(camera: { room?: string; roomId?: string | null }): Promise<void> {
    if (camera.roomId === undefined && camera.room === undefined) return;

    const room = this.roomsService.byId(camera.roomId) ?? (camera.room ? await this.roomsService.resolveByName(camera.room) : await this.roomsService.fallback());

    camera.roomId = room.id;
    camera.room = this.roomsService.label(room.id) ?? room.name;
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
      deleteSourceCodecInfo(source._id);
    }

    await this.usersService.removeCameraFromPreferences(camera._id);
    await this.floorPlanService.dropCameras([camera._id]);
    await this.dbs.camerasDB.remove(camera._id);
    await this.removeCameraSourcesFromConfig(camera.name, camera.sources);
    await this.api.removeCamera(this.transformCamera(camera), camera.assignments);
  }

  private async addCameraSourcesToConfig(cameraId: string, cameraname: string, sources: CameraInputSettings[]): Promise<void> {
    for (const source of sources) {
      source.urls = generatedSourceUrls(cameraId, this.configService.config.port, source);

      const sourceName = createSourceName(cameraname, source.name);
      const baseUrls = go2rtcStreamUrls(sourceName, source, source.urls);

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

      if (this.configService.go2rtcConfig.preload?.[sourceName]) {
        preloadsToRemove.push(sourceName);
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

  private clearInvalidObjectAssist(camera: DBCamera): boolean {
    const assist = camera.assignments.objectAssist;
    const object = camera.assignments.object;

    if (!assist || Array.isArray(assist)) return false;

    if (object && !Array.isArray(object) && object.name !== assist.name) {
      const registry = container.resolve<SensorRegistry>('sensorRegistry');
      const sensor = registry.getAllSensors({ connectedOnly: true, cameraId: camera._id, pluginId: object.id }).find((s) => s.type === SensorType.Object);
      // provider not running, its frame need is unknown and the assignment stays untouched
      if (!sensor?.data.requiresFrames) return false;
    }

    camera.assignments.objectAssist = undefined;
    return true;
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
