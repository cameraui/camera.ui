import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { CamerasService } from '../../api/services/cameras.service.js';
import { FloorPlanService } from '../../api/services/floorplan.service.js';
import { PluginsService } from '../../api/services/plugins.service.js';
import { RoomsService } from '../../api/services/rooms.service.js';
import { ConfigService } from '../../services/config/index.js';
import { collectSystemInfo } from '../../utils/system-info.js';

import type { CameraUiAPI } from '../../api.js';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { WorkerManager } from '../../workers/manager.js';
import type { AssistantToolRegistry } from '../registry.js';
import type { CoreTool, ToolContext } from './shared.js';

const getSystemStatus = toolDefinition({
  name: 'get_system_status',
  description:
    'Report the health of the instance: camera.ui version, host hardware, plugins with their run state, remote workers, ' +
    'and which cameras are online or have stream problems. Use it for "is everything running" questions.',
  inputSchema: zod.object({}),
}).server<ToolContext['context']>(async (_input, ctx) => {
  const api = container.resolve<CameraUiAPI>('api');
  const go2rtc = container.resolve<Go2RtcApi>('go2rtcApi');
  const workers = container.resolve<WorkerManager>('workerManager');
  const plugins = new PluginsService();

  const [system, streams] = await Promise.all([
    collectSystemInfo(ConfigService.RUNNING_VERSION).catch(() => undefined),
    go2rtc.streamsRoute.getStreamsStatus().catch(() => ({})),
  ]);

  const cameras = new CamerasService().list().map((camera) => {
    const controller = api.getCamera(camera._id);
    const sourceStates = Object.entries(streams)
      .filter(([name]) => name.startsWith(camera._id))
      .map(([, state]) => state);
    return {
      name: camera.name,
      online: controller?.connected ?? false,
      analysis: controller?.frameWorkerConnected ?? false,
      streams: sourceStates.length ? sourceStates : undefined,
    };
  });

  const pluginStates =
    ctx.context.role === 'user' ? undefined : plugins.listPlugins().map((p) => ({ name: p.displayName, version: p.info.installedVersion, status: p.worker.status }));
  const workerStates = ctx.context.role === 'user' ? undefined : workers.getWorkers().map((w) => ({ name: w.name, online: w.online, cameras: w.cameras.length }));

  return {
    version: ConfigService.RUNNING_VERSION,
    host: system ? { cpu: system.cpu, cores: system.cores, memoryGb: system.memoryGb, gpu: system.gpu, os: system.os } : undefined,
    cameras,
    offlineCameras: cameras.filter((c) => !c.online).map((c) => c.name),
    plugins: pluginStates,
    workers: workerStates,
  };
});

const getFloorPlan = toolDefinition({
  name: 'get_floor_plan',
  lazy: true,
  description:
    'Describe the house layout: levels, rooms with their cameras, and which rooms connect through doors or stairs. ' +
    'Use it to resolve "the camera in the kitchen" or "the room next to the entrance".',
  inputSchema: zod.object({}),
}).server<ToolContext['context']>(() => {
  const plan = new FloorPlanService().get();
  const catalog = new RoomsService().get();
  const cameras = new Map(new CamerasService().list().map((c) => [c._id, c.name]));
  const roomName = new Map(catalog.rooms.map((r) => [r.id, r.name]));
  const levelName = new Map(catalog.levels.map((l) => [l.id, l.name]));

  const rooms = catalog.rooms.map((room) => ({
    name: room.name,
    level: room.levelId ? levelName.get(room.levelId) : undefined,
    outdoor: room.outdoor || undefined,
    cameras: plan.cameras.filter((c) => c.roomId === room.id).map((c) => cameras.get(c.cameraId) ?? c.cameraId),
    sensors: plan.sensors?.filter((s) => s.roomId === room.id).length || undefined,
  }));

  const connections = plan.connections.map((c) => ({ from: roomName.get(c.fromRoomId) ?? c.fromRoomId, to: roomName.get(c.toRoomId) ?? c.toRoomId, type: c.type }));

  return { levels: catalog.levels.map((l) => l.name), rooms, connections };
});

export function createListToolsTool(registry: AssistantToolRegistry): CoreTool {
  return toolDefinition({
    name: 'list_tools',
    description: 'List every tool you can call right now, including the ones plugins contribute, with a one line description each.',
    inputSchema: zod.object({}),
  }).server<ToolContext['context']>((_input, ctx) => {
    return registry.describe(ctx.context.role).map((tool) => ({ name: tool.name, description: tool.description, needsConfirmation: tool.approval }));
  });
}

export const systemTools: CoreTool[] = [getSystemStatus, getFloorPlan];
