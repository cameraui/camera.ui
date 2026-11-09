import { toolDefinition } from '@tanstack/ai';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as zod from 'zod';

import { PluginsService } from '../../api/services/plugins.service.js';
import { UsersService } from '../../api/services/users.service.js';
import { inject, tryInject } from '../../container.js';
import { getSensorDiscovery } from '../../sensors/discovery.js';
import { readLogTail } from '../../services/logger/logReader.js';
import { approvalSchema, toolError } from './shared.js';

import type { ServerNamespace } from '../../api/websocket/nsp/server.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { CoreTool, ToolContext } from './shared.js';

const QUERIES = {
  discovered_cameras: 'cameras found in the network, adopted or not, and whether a scan runs',
  rescan_cameras: 'scan the network for cameras again',
  camera_connection_schema: 'fields a discovered camera needs for adoption (args: discoveredId)',
  discovered_sensors: 'sensors and accessories a plugin offers that are not set up yet, without state (for sensors in use call list_sensors)',
  rescan_sensors: 'scan the sensor sources again',
  notifications: 'notification history of the user (args: limit, unseenOnly)',
  logs: 'last lines of a log: server, go2rtc, nats, tunnel, all, a camera or plugin name (args: source, lines, filter); admin',
  updates: 'available updates for camera.ui, plugins and workers (args: refresh); admin',
  mqtt_status: 'MQTT broker connection; admin',
  runtime_status: 'run state of go2rtc, nats and every plugin process; admin',
} as const;

const ACTIONS = {
  adopt_camera: 'adopt a discovered camera (args: discoveredId, credentials from camera_connection_schema); admin',
  adopt_sensor: 'adopt a discovered sensor (args: pluginId, sensorId); admin',
  mark_notifications_seen: 'mark all notifications of the user as seen',
  clear_notifications: 'delete the notification history of the user',
  remove_notification: 'delete one notification (args: id)',
} as const;

const SYSTEM_LOGS = new Set(['server', 'go2rtc', 'nats', 'tunnel']);
const LOG_TAIL_BYTES = 64_000;
const LOG_LINES_MAX = 300;

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

type QueryName = keyof typeof QUERIES;
type ActionName = keyof typeof ACTIONS;
type Args = Record<string, unknown>;

interface DiscoveredEntry {
  name: string;
  manufacturer?: string;
  model?: string;
  address?: string;
  status: string;
  error?: string;
  hiddenByUser?: true;
  providers: { provider: string; discoveredId: string }[];
}

function describe(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([name, text]) => `${name}: ${text}`)
    .join('. ');
}

function isAdmin(ctx: ToolContext): boolean {
  return ctx.context.role === 'admin' || ctx.context.role === 'master';
}

function text(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const systemQuery = toolDefinition({
  name: 'system_query',
  description:
    'Show the notification history, discovered cameras and sensors waiting for adoption, a network scan, logs, ' +
    `available updates, MQTT and process states. Actions: ${describe(QUERIES)}.`,
  inputSchema: zod.object({
    action: zod.enum(Object.keys(QUERIES) as [QueryName, ...QueryName[]]),
    args: zod.record(zod.string(), zod.unknown()).optional().describe('Arguments of the action'),
  }),
}).server<ToolContext['context']>(async ({ action, args }, ctx) => runQuery(action, args ?? {}, ctx));

const systemActionInput = zod.object({
  action: zod.enum(Object.keys(ACTIONS) as [ActionName, ...ActionName[]]),
  args: zod.record(zod.string(), zod.unknown()).optional().describe('Arguments of the action'),
});

const systemAction = toolDefinition({
  name: 'system_action',
  lazy: true,
  description:
    'Adopt a discovered camera or sensor, mark notifications as seen or clear them. Requires user confirmation. Never ask for a password in the chat, ' +
    `send the user to the Cameras page instead. Actions: ${describe(ACTIONS)}.`,
  needsApproval: true,
  inputSchema: approvalSchema(systemActionInput),
  metadata: { adminOnly: true },
}).server<ToolContext['context']>(async (raw, ctx) => {
  const parsed = systemActionInput.safeParse(raw);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  return runAction(parsed.data.action, parsed.data.args ?? {}, ctx);
});

async function runQuery(action: QueryName, args: Args, ctx: ToolContext): Promise<unknown> {
  const proxy = inject('proxy');

  switch (action) {
    case 'discovered_cameras':
      return cameraDiscovery(await proxy.discoveryManager.snapshot(), ctx);
    case 'rescan_cameras':
      await proxy.discoveryManager.forceRescan();
      return cameraDiscovery(await proxy.discoveryManager.snapshot(), ctx);
    case 'camera_connection_schema': {
      const discoveredId = text(args, 'discoveredId');
      if (!discoveredId) return toolError('discoveredId is required, take it from discovered_cameras.');
      const fields = await proxy.discoveryManager.getConnectionSchema(discoveredId);
      return { discoveredId, fields, hint: 'A password or secret field must be filled in by the user in the app, not in this chat.' };
    }
    case 'discovered_sensors':
      return sensorDiscovery(await getSensorDiscovery().snapshot());
    case 'rescan_sensors':
      await getSensorDiscovery().forceRescan();
      return sensorDiscovery(await getSensorDiscovery().snapshot());
    case 'notifications': {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const filter = args.unseenOnly === true ? 'unread' : 'all';
      const page = proxy.notificationManager.page(ctx.context.userId, { limit, filter });
      return {
        total: page.counts?.[filter] ?? page.items.length,
        unseen: page.unread,
        notifications: page.items.map((n) => ({
          id: n.id,
          at: new Date(n.createdAt).toISOString(),
          title: n.title,
          subtitle: n.subtitle,
          body: n.body,
          severity: n.severity,
          tag: n.tag,
          seen: Boolean(n.seenAt),
          source: n.source.kind,
          log: n.log && {
            count: n.log.count,
            last: new Date(n.log.lastAt).toISOString(),
            messages: n.log.messages.slice(0, 5).map(({ text, count }) => ({ text, count })),
          },
        })),
      };
    }
    case 'logs':
      if (!isAdmin(ctx)) return toolError('Logs are available to admins only.');
      return readLog(text(args, 'source') ?? 'server', Math.min(Math.max(Number(args.lines) || 80, 1), LOG_LINES_MAX), text(args, 'filter'));
    case 'updates': {
      if (!isAdmin(ctx)) return toolError('Updates are available to admins only.');
      const server = inject('socketService').namespaces.get('/server') as ServerNamespace | undefined;
      if (!server) return toolError('Update checks are not running.');
      if (args.refresh === true) await Promise.all([server.checkServer(), server.checkPlugins()]);
      const updates = server.getUpdates();
      return {
        server: updates.server
          ? { installed: updates.server.installedVersion, latest: updates.server.latestVersion, updateAvailable: updates.server.updateAvailable }
          : undefined,
        plugins: updates.plugins.filter((p) => p.updateAvailable).map((p) => ({ plugin: p.pluginName, installed: p.installedVersion, latest: p.latestVersion })),
        workerUpdateAvailable: updates.workerUpdateAvailable,
      };
    }
    case 'mqtt_status':
      if (!isAdmin(ctx)) return toolError('MQTT status is available to admins only.');
      return tryInject('mqttManager')?.getStatus() ?? { enabled: false };
    case 'runtime_status': {
      if (!isAdmin(ctx)) return toolError('Process states are available to admins only.');
      const plugins = new PluginsService();
      return {
        go2rtc: inject('go2rtc').status,
        nats: inject('natsServer').status,
        plugins: plugins.listPlugins().map((p) => ({ name: p.displayName, version: p.info.installedVersion, status: p.worker.status })),
        installQueue: plugins.installingPlugins(),
      };
    }
    default:
      return toolError(`Unknown action "${action as string}".`);
  }
}

async function runAction(action: ActionName, args: Args, ctx: ToolContext): Promise<unknown> {
  const proxy = inject('proxy');

  switch (action) {
    case 'adopt_camera': {
      if (!isAdmin(ctx)) return toolError('Adopting cameras is an admin task.');
      const discoveredId = text(args, 'discoveredId');
      if (!discoveredId) return toolError('discoveredId is required, take it from discovered_cameras.');
      const credentials = (args.credentials ?? {}) as Record<string, unknown>;
      const result = await proxy.discoveryManager.connect(discoveredId, credentials);
      return { ok: true, cameraId: result.cameraId, cameraName: result.cameraName };
    }
    case 'adopt_sensor': {
      if (!isAdmin(ctx)) return toolError('Adopting sensors is an admin task.');
      const pluginId = text(args, 'pluginId');
      const sensorId = text(args, 'sensorId');
      if (!pluginId || !sensorId) return toolError('pluginId and sensorId are required, take them from discovered_sensors.');
      const discovery = getSensorDiscovery();
      const sensor = (await discovery.snapshot()).sensors.find((item) => item.pluginId === pluginId && item.id === sensorId);
      if (!sensor) return toolError(`No discovered sensor "${sensorId}" from plugin "${pluginId}".`);
      await discovery.adopt(pluginId, sensor);
      return { ok: true, sensor: sensor.name };
    }
    case 'mark_notifications_seen':
      proxy.notificationManager.markSeen(ctx.context.userId);
      return { ok: true };
    case 'clear_notifications':
      proxy.notificationManager.remove(ctx.context.userId);
      return { ok: true };
    case 'remove_notification': {
      const id = text(args, 'id');
      if (!id) return toolError('id is required, take it from the notifications query.');
      proxy.notificationManager.remove(ctx.context.userId, [id]);
      return { ok: true };
    }
    default:
      return toolError(`Unknown action "${action as string}".`);
  }
}

function cameraDiscovery(snapshot: Awaited<ReturnType<ProxyServer['discoveryManager']['snapshot']>>, ctx: ToolContext) {
  const user = new UsersService().findById(ctx.context.userId);
  const hidden = new Set(user ? new UsersService().getHiddenDevices(user.username).map((d) => d.id) : []);
  const byAddress = new Map<string, DiscoveredEntry>();
  for (const d of snapshot.devices.filter((device) => device.type === 'discovered')) {
    const key = d.address ?? d.discoveredId ?? d.id;
    const entry = byAddress.get(key);
    if (entry) {
      entry.providers.push({ provider: d.provider, discoveredId: d.discoveredId ?? d.id });
      continue;
    }
    byAddress.set(key, {
      name: d.name,
      manufacturer: d.manufacturer,
      model: d.model,
      address: d.address,
      status: d.status,
      error: d.errorMessage,
      hiddenByUser: hidden.has(d.id) || undefined,
      providers: [{ provider: d.provider, discoveredId: d.discoveredId ?? d.id }],
    });
  }
  return {
    scanning: snapshot.isScanning ?? undefined,
    hint: snapshot.isScanning ? 'A scan is still running, query again in a few seconds for the complete list.' : undefined,
    discovered: Array.from(byAddress.values()),
    adopted: snapshot.devices.filter((d) => d.type === 'camera').map((d) => ({ name: d.name, room: d.room, address: d.address, status: d.status })),
  };
}

function sensorDiscovery(snapshot: Awaited<ReturnType<ReturnType<typeof getSensorDiscovery>['snapshot']>>) {
  return {
    scanning: snapshot.isScanning || undefined,
    hint: snapshot.isScanning ? 'A scan is still running, query again in a few seconds for the complete list.' : undefined,
    sensors: snapshot.sensors.map((s) => ({ pluginId: s.pluginId, plugin: s.pluginName, sensorId: s.id, name: s.name, address: s.address })),
  };
}

async function readLog(source: string, lines: number, filter?: string): Promise<unknown> {
  const config = inject('configService');
  const file = logFile(source, config);
  if (!file) return toolError(`No log source "${source}". Use server, go2rtc, nats, tunnel, all, a camera name or a plugin name.`);
  if (!existsSync(file)) return { source, lines: [], note: 'The log file does not exist yet.' };

  let entries = (await readLogTail(file, LOG_TAIL_BYTES))
    .replace(ANSI, '')
    .split('\n')
    .filter((line) => line.trim());
  const needle = filter?.toLowerCase();
  if (needle) entries = entries.filter((line) => line.toLowerCase().includes(needle));
  return { source, lines: entries.slice(-lines) };
}

function logFile(source: string, config: ConfigService): string | undefined {
  if (source === 'all') return config.LOG_FILE;
  if (SYSTEM_LOGS.has(source)) return join(config.LOGS_PATH, `system-${source}.log`);
  const camera = inject('api').getCamera(source);
  if (camera) return camera.logPath;
  const plugins = inject('pluginManager').plugins;
  const needle = source.toLowerCase();
  const plugin = plugins.get(source) ?? Array.from(plugins.values()).find((p) => p.displayName.toLowerCase() === needle || p.pluginName.toLowerCase() === needle);
  return plugin?.logPath;
}

export const instanceTools: CoreTool[] = [systemQuery, systemAction];
