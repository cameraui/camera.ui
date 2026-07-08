import { orderBy } from '@camera.ui/common/utils';
import { canCreateCameras, canProvideSensorsToAnyCameras, hasInterface, PluginInterface, PluginRole } from '@camera.ui/sdk';
import { TTLCache } from '@isaacs/ttlcache';
import { pathExists, remove } from 'fs-extra/esm';
import { createReadStream, truncate } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { container } from 'tsyringe';

import { PluginManager } from '../../plugins/index.js';
import { ConfigService } from '../../services/config/index.js';
import { checkEngineCompatibility } from '../../utils/engines.js';
import { checkForUpdate, extractPackage, getManifest, getPackument, getVersionsAndDistTags, invalidatePackage, searchPackages } from '../../utils/npm/index.js';
import { isPlatformCompatible } from '../../utils/platform.js';
import { computeTrust, getBlock, getBlocklist, getCatalog, getVerified, getWeeklyDownloads, invalidateRegistry } from '../../utils/plugin-registry/index.js';
import { CamerasService } from '../services/cameras.service.js';
import { PluginsService } from '../services/plugins.service.js';
import { resolvePluginName } from '../utils/plugin.js';

import type { JsonSchema } from '@camera.ui/sdk';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Server } from 'socket.io';
import type { Plugin } from '../../plugins/plugin.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { NpmSearchObject } from '../../utils/npm/index.js';
import type { CatalogEntry, VerifiedEntry } from '../../utils/plugin-registry/index.js';
import type {
  AuthLoginRequest,
  CameraUiPlugin,
  INpmPluginState,
  PaginationRequest,
  PluginExtension,
  PluginExtensionConfig,
  PluginsInsertRequest,
  PluginsParamsNameRequest,
  PluginsParamsRemoveRequest,
  PluginsProgress,
  PluginsQueryRequest,
  StoragePatchRequest,
  StorageSetRequest,
  StorageSubmitRequest,
} from '../types/index.js';
import type { SocketService } from '../websocket/index.js';
import type { ServerNamespace } from '../websocket/nsp/server.js';

const searchResultBlacklist = new Set(['camera.ui', 'homebridge-camera-ui']);
const pluginLogoCache = new TTLCache<string, string>({ max: 100, ttl: 1000 * 60 * 60 * 24 });

function normalizeRepoUrl(url: string): string {
  let normalized = url.trim().replace(/^git\+/, '');

  const scpMatch = /^git@([^:]+):(.+)$/.exec(normalized);
  if (scpMatch) {
    normalized = `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  normalized = normalized
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');

  return normalized;
}

export class PluginsController {
  private logger: LoggerService;
  private configService: ConfigService;
  private io: Server;
  private pluginManager: PluginManager;
  private proxyServer: ProxyServer;
  private service: PluginsService;
  private camerasService: CamerasService;
  private socketService: SocketService;

  constructor(private app: FastifyInstance) {
    this.io = app.io;
    this.service = new PluginsService();
    this.camerasService = new CamerasService();

    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
    this.pluginManager = container.resolve<PluginManager>('pluginManager');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.socketService = container.resolve<SocketService>('socketService');
  }

  public async enableByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!plugin.disabled) {
        return reply.code(400).send({
          statusCode: 404,
          message: 'Plugin already enabled',
        });
      }

      plugin.disabled = false;

      if (this.configService.config.plugins.disabledPlugins.includes(pluginName)) {
        const index = this.configService.config.plugins.disabledPlugins.indexOf(pluginName);
        this.configService.config.plugins.disabledPlugins.splice(index, 1);
        this.configService.writeConfig();
      }

      // Start the plugin in the background. The UI reflects the real state via the
      // /plugins `plugin-status-<name>` socket event when the child reaches STARTED/ERROR.
      this.pluginManager.startPluginChild(pluginName).catch((error: unknown) => {
        this.logger.error(`Failed to start plugin ${pluginName} after enable:`, error);
      });

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async disableByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (plugin.disabled) {
        return reply.code(400).send({
          statusCode: 404,
          message: 'Plugin already disabled',
        });
      }

      plugin.disabled = true;

      this.configService.config.plugins.disabledPlugins.push(pluginName);
      this.configService.writeConfig();

      // Stop in the background — same reasoning as enable: a graceful teardown can
      // run into its shutdown grace period and shouldn't hold the HTTP reply open.
      this.pluginManager.stopPluginChild(pluginName).catch((error: unknown) => {
        this.logger.error(`Failed to stop plugin ${pluginName} after disable:`, error);
      });

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): FastifyReply {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      return reply.code(200).send(plugin.info);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getPluginUpdateByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const pluginUpdateState = await this.getPluginFromNpm(plugin.info);

      return reply.code(200).send(pluginUpdateState);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getVersionsByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const availableVersions = await getVersionsAndDistTags(pluginName);
      return reply.code(200).send(availableVersions);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getEngineCompatByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & PluginsQueryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const pluginVersion = req.query.pluginversion ?? 'latest';

      let engines: Record<string, string> | undefined;
      let os: string[] | undefined;
      let cpu: string[] | undefined;

      try {
        const manifest = await getManifest(`${pluginName}@${pluginVersion}`);
        engines = manifest.engines;
        os = (manifest as { os?: string[] }).os;
        cpu = (manifest as { cpu?: string[] }).cpu;
      } catch (error: any) {
        this.logger.warn(`Failed to resolve engines for ${pluginName}@${pluginVersion}: ${error.message}`);
        return reply.code(200).send({ compatible: true, issues: [], platformCompatible: true });
      }

      const issues = checkEngineCompatibility(engines, ConfigService.VERSION, process.version);

      return reply.code(200).send({ compatible: issues.length === 0, issues, os, cpu, platformCompatible: isPlatformCompatible(os, cpu) });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getPluginLogoByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      pluginLogoCache.purgeStale();

      const cacheKey = plugin ? pluginName : `${pluginName}@latest`;

      let base64Logo = pluginLogoCache.get(cacheKey) ?? null;
      base64Logo ??= plugin ? await this.readLogoFromPath(join(plugin.installPath, 'logo.png')) : await this.readLogoFromTarball(pluginName);

      if (!base64Logo) {
        return reply.code(200).send(Buffer.from('').toString('base64'));
      }

      pluginLogoCache.set(cacheKey, base64Logo);

      reply.header('Content-Type', 'image/png');
      return reply.code(200).send(`data:image/png;base64,${base64Logo}`);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getConfigByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const pluginWorker = this.service.getPluginProcessByName(pluginName);

      if (!pluginWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const schemaConfig = await pluginWorker.storageProxy.getConfig();

      const cameraExtension: PluginExtensionConfig = {
        pluginName: pluginWorker.plugin.pluginName,
        displayName: pluginWorker.plugin.displayName,
        contract: pluginWorker.plugin.contract,
        ...schemaConfig,
      };

      return reply.code(200).send(cameraExtension);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchConfigByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & StoragePatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const pluginWorker = this.service.getPluginProcessByName(pluginName);

      if (!pluginWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      await pluginWorker.storageProxy.setConfig(req.body);

      return reply.code(200).send(req.body);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async setConfigByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & StorageSetRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const pluginWorker = this.service.getPluginProcessByName(pluginName);

      if (!pluginWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      await pluginWorker.storageProxy.setValue<undefined>(req.body.key, undefined);

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async submitConfigByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & StorageSubmitRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const pluginWorker = this.service.getPluginProcessByName(pluginName);

      if (!pluginWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const response = await pluginWorker.storageProxy.submitValue(req.body.key, req.body.payload);

      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getPluginInterface(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const pluginWorker = this.service.getPluginProcessByName(pluginName);

      if (!pluginWorker?.pluginProxy) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists or not running',
        });
      }

      const contract = pluginWorker.plugin.contract;
      const allSettings: JsonSchema[] = [];

      try {
        if (hasInterface(contract, PluginInterface.MotionDetection)) {
          const motionDetectionSettings = await pluginWorker.pluginProxy.motionDetectionSettings?.();
          if (motionDetectionSettings) allSettings.push(...motionDetectionSettings);
        }
        if (hasInterface(contract, PluginInterface.ObjectDetection)) {
          const objectDetectionSettings = await pluginWorker.pluginProxy.objectDetectionSettings?.();
          if (objectDetectionSettings) allSettings.push(...objectDetectionSettings);
        }
        if (hasInterface(contract, PluginInterface.AudioDetection)) {
          const audioDetectionSettings = await pluginWorker.pluginProxy.audioDetectionSettings?.();
          if (audioDetectionSettings) allSettings.push(...audioDetectionSettings);
        }
        if (hasInterface(contract, PluginInterface.FaceDetection)) {
          const faceDetectionSettings = await pluginWorker.pluginProxy.faceDetectionSettings?.();
          if (faceDetectionSettings) allSettings.push(...faceDetectionSettings);
        }
        if (hasInterface(contract, PluginInterface.LicensePlateDetection)) {
          const licensePlateDetectionSettings = await pluginWorker.pluginProxy.licensePlateDetectionSettings?.();
          if (licensePlateDetectionSettings) allSettings.push(...licensePlateDetectionSettings);
        }
        if (hasInterface(contract, PluginInterface.ClassifierDetection)) {
          const classifierDetectionSettings = await pluginWorker.pluginProxy.classifierDetectionSettings?.();
          if (classifierDetectionSettings) allSettings.push(...classifierDetectionSettings);
        }
      } catch {
        //
      }

      return reply.code(200).send(allSettings.length > 0 ? allSettings : undefined);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getContractByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): FastifyReply {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const contract = plugin.contract;
      // CameraController plugins can only work with cameras they created
      // CameraAndSensorProvider plugins can work with any camera (provide sensors to all)
      // Other plugins (Hub, SensorProvider) can also be assigned to any camera
      const onlyOwnCameras = canCreateCameras(contract) && !canProvideSensorsToAnyCameras(contract);
      const camerasList = onlyOwnCameras ? this.camerasService.listByPluginId(plugin.id) : this.camerasService.list();

      const cameras =
        camerasList?.map((camera) => {
          return {
            name: camera.name,
            plugins: camera.plugins,
            assignments: camera.assignments,
            pluginInfo: camera.pluginInfo,
          };
        }) || [];

      return reply.code(200).send({ contract, cameras });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getReadmeByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & PluginsQueryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      const file = await this.readPluginDoc(pluginName, plugin?.installPath, plugin?.info.installedVersion, 'README.md', req.query.pluginversion);

      if (file === null) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Readme not found',
        });
      }

      reply.header('Content-Type', 'text/plain');
      return reply.code(200).send(file);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getChangelogByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & PluginsQueryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      const file = await this.readPluginDoc(pluginName, plugin?.installPath, plugin?.info.installedVersion, 'CHANGELOG.md', req.query.pluginversion);

      if (file === null) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Changelog not found',
        });
      }

      reply.header('Content-Type', 'text/plain');
      return reply.code(200).send(file);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public list(_req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | CameraUiPlugin[] {
    try {
      const installedPlugins = this.service.listPlugins();
      const plugins = installedPlugins.map((plugin) => ({
        ...plugin.info,
        workerAgentId: this.service.getPluginDbByName(plugin.pluginName)?.workerAgentId,
      }));

      return orderBy(plugins, ['displayName'], ['asc']);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public listExtensions(_req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | PluginExtension[] {
    try {
      const installedPlugins = this.service.listPlugins();
      const allExtensions: PluginExtension[] = installedPlugins.map((plugin) => ({
        pluginName: plugin.pluginName,
        displayName: plugin.displayName,
        contract: plugin.contract,
      }));

      return orderBy(allExtensions, ['displayName'], ['asc']);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async restartByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const pluginProcess = this.service.getPluginProcessByName(pluginName);

      if (!pluginProcess) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin process not initialized',
        });
      }

      await pluginProcess.restart();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public clearLog(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      truncate(plugin.logPath, (error) => {
        if (error) {
          return reply.code(500).send({
            statusCode: 500,
            message: error.message,
          });
        }

        this.app.io.of('/logs').emit('clear-plugin-log', pluginName);

        return reply.code(204).send();
      });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public downloadLog(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const buffer = new Readable();
      buffer._read = () => {};

      const readStream = createReadStream(plugin.logPath);

      readStream.on('data', (data) => {
        buffer.push(data.toString('utf8').replace(/\x1b\[[0-9;]*m/g, ''));
      });

      readStream.on('end', () => {
        buffer.push(null);
      });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename=camera.ui.${plugin.pluginName}.log.txt`);

      return reply.code(200).send(buffer);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async search(req: FastifyRequest<AuthLoginRequest & PluginsQueryRequest & PaginationRequest>, reply: FastifyReply): Promise<FastifyReply | CameraUiPlugin[]> {
    try {
      const query = req.query.pluginname ?? '';
      const text = (query?.length ? `${query} ` : '') + 'keywords:camera-ui-plugin not:deprecated';

      if (req.query.refresh) {
        invalidateRegistry();
        invalidatePackage();
      }

      const searchResults = await searchPackages(text, 30);

      const [catalog, verified, blocklist] = await Promise.all([getCatalog(), getVerified(), getBlocklist()]);
      const installedPlugins = this.service.listPlugins();

      const result: CameraUiPlugin[] = [];

      for (const pkg of searchResults) {
        if (!(pkg.name.startsWith('camera-ui-') || this.isScopedPlugin(pkg.name))) {
          continue;
        }
        if (searchResultBlacklist.has(pkg.name)) {
          continue;
        }

        const isInstalled = installedPlugins.find((installedPlugin) => installedPlugin.pluginName === pkg.name);

        if (isInstalled) {
          const plugin = isInstalled.info;
          plugin.lastUpdated = pkg.date;

          const block = getBlock(pkg.name, plugin.installedVersion, blocklist);
          if (block) {
            plugin.blocked = block;
            await this.autoDisableBlockedPlugin(isInstalled, block);
          }

          this.enrichPlugin(plugin, pkg, catalog, verified);
          result.push(plugin);
          continue;
        }

        // Blocked plugins are never shown in the store and cannot be installed.
        if (getBlock(pkg.name, pkg.version, blocklist)) {
          continue;
        }

        const plugin: CameraUiPlugin = {
          id: '0',
          pluginName: pkg.name,
          displayName: PluginManager.transformDisplaName(pkg.name),
          private: false,
          isPython: false,
          isGo: false,
          isNode: true,
          publicPackage: true,
          installedVersion: undefined,
          latestVersion: pkg.version,
          lastUpdated: pkg.date,
          description: pkg.description ? pkg.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pkg.name,
          links: pkg.links,
          author: pkg.publisher?.username,
          contract: {
            role: PluginRole.SensorProvider,
            provides: [],
            consumes: [],
            interfaces: [],
            name: '',
          },
          // npm search results carry no platform data — resolved at install.
          compatible: true,
        };

        this.enrichPlugin(plugin, pkg, catalog, verified);
        result.push(plugin);
      }

      const downloads = await getWeeklyDownloads(result.map((plugin) => plugin.pluginName));
      for (const plugin of result) {
        const weekly = downloads[plugin.pluginName];
        if (typeof weekly === 'number') {
          plugin.downloads = { weekly };
        }
      }

      if (!result.length && (query.startsWith('camera-ui-') || this.isScopedPlugin(query)) && !searchResultBlacklist.has(query.toLowerCase())) {
        const singlePluginQuey = await this.searchNpmRegistrySingle(query.toLowerCase());
        return singlePluginQuey ? [singlePluginQuey] : [];
      }

      return orderBy(result, ['displayName'], ['asc']);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async startByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const pluginProcess = this.service.getPluginProcessByName(pluginName);

      if (!pluginProcess) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin process not initialized',
        });
      }

      await pluginProcess.start();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async stopByName(req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const pluginProcess = this.service.getPluginProcessByName(pluginName);

      if (!pluginProcess) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin process not initialized',
        });
      }

      await pluginProcess.teardown();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async installOrUpdate(req: FastifyRequest<AuthLoginRequest & PluginsInsertRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const blocklist = await getBlocklist();
      const block = getBlock(req.body.pluginname, req.body.pluginversion, blocklist);
      if (block) {
        return reply.code(403).send({
          statusCode: 403,
          message: `Plugin is blocked: ${block.reason}`,
        });
      }

      let plugin = this.pluginManager.plugins.get(req.body.pluginname);

      const command = plugin ? 'update' : 'install';

      this.logger.log(`${plugin ? 'Updating' : 'Installing'} plugin: ${req.body.pluginname}@${req.body.pluginversion}`);

      const installPath = await this.service.manage(req.body.pluginname, command, req.body.pluginversion, plugin?.id);

      if (!plugin) {
        plugin = await this.pluginManager.loadPlugin(installPath);

        this.logger.log(`Plugin installed: ${plugin.pluginName}.${plugin.displayName} (${plugin.info.installedVersion})`);

        this.pluginManager.initializeInstalledPlugin(plugin);
      } else {
        this.logger.log(`Plugin updated: ${plugin.pluginName}.${plugin.displayName} (${req.body.pluginversion})`);
      }

      invalidatePackage(plugin.pluginName);
      await plugin.reparsePackageJson();

      const serverNsp = this.socketService.namespaces.get('/server');
      await (serverNsp as ServerNamespace).checkPlugins();

      return reply.code(201).send(plugin.info);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async installProgress(_req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): Promise<FastifyReply | PluginsProgress[]> {
    try {
      const pluginsInProgress = this.service.installingPlugins();
      return orderBy(pluginsInProgress, ['pluginName'], ['asc']);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async uninstallByName(
    req: FastifyRequest<AuthLoginRequest & PluginsParamsNameRequest & PluginsParamsRemoveRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const pluginName = resolvePluginName(req.params);
      const plugin = this.service.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      this.logger.log(`Uninstalling plugin: ${plugin.pluginName}.${plugin.displayName} (${plugin.info.installedVersion})`);

      await this.service.manage(plugin.pluginName, 'uninstall', undefined, plugin.id);
      await this.pluginManager.removePlugin(plugin, req.query.removeStorage);

      invalidatePackage(plugin.pluginName);

      this.logger.log(`Plugin uninstalled: ${plugin.pluginName}.${plugin.displayName} (${plugin.info.installedVersion})`);

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async uninstallAll(req: FastifyRequest<AuthLoginRequest & PluginsParamsRemoveRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      this.logger.log('Uninstalling all plugins');

      const plugins = this.service.listPlugins();
      const pluginNames = plugins.map((plugin) => plugin.pluginName);

      await Promise.all(plugins.map((plugin) => this.service.manage(plugin.pluginName, 'uninstall', undefined, plugin.id)));

      for (const plugin of plugins) {
        await this.pluginManager.removePlugin(plugin, req.query.removeStorage);
      }

      pluginNames.forEach((name) => invalidatePackage(name));

      this.logger.log('All plugins uninstalled');

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  private async readLogoFromPath(logoPath: string): Promise<string | null> {
    if (!(await pathExists(logoPath))) {
      return null;
    }

    const logo = await sharp(logoPath).resize({ width: 100, height: 100, fit: 'cover', kernel: 'nearest' }).toBuffer();
    return Buffer.from(logo).toString('base64');
  }

  private async readLogoFromTarball(pluginName: string): Promise<string | null> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'camera.ui-logo-'));
    try {
      await extractPackage(`${pluginName}@latest`, tmpDir);
      return await this.readLogoFromPath(join(tmpDir, 'logo.png'));
    } catch {
      return null;
    } finally {
      await remove(tmpDir);
    }
  }

  private enrichPlugin(plugin: CameraUiPlugin, pkg: NpmSearchObject, catalog: Record<string, CatalogEntry>, verified: Record<string, VerifiedEntry>): void {
    plugin.trust = computeTrust(plugin.pluginName, verified, plugin.latestVersion);

    const catalogEntry = catalog[plugin.pluginName];
    if (catalogEntry) {
      if (catalogEntry.displayName) {
        plugin.displayName = catalogEntry.displayName;
      }
      plugin.category = catalogEntry.category;
      plugin.featured = catalogEntry.featured;
      plugin.tagline = catalogEntry.tagline;
      plugin.logo = catalogEntry.logo;
      plugin.screenshots = catalogEntry.screenshots;
    }

    if (plugin.links?.repository) {
      plugin.links.repository = normalizeRepoUrl(plugin.links.repository);
    }

    const keywords = pkg.keywords?.filter((keyword) => keyword !== 'camera-ui-plugin');
    if (keywords?.length) {
      plugin.keywords = keywords;
    }
  }

  private async autoDisableBlockedPlugin(plugin: Plugin, block: { reason: string; ref?: string }): Promise<void> {
    if (plugin.disabled) {
      return;
    }

    try {
      plugin.disabled = true;

      if (!this.configService.config.plugins.disabledPlugins.includes(plugin.pluginName)) {
        this.configService.config.plugins.disabledPlugins.push(plugin.pluginName);
        this.configService.writeConfig();
      }

      await this.pluginManager.stopPluginChild(plugin.pluginName);

      this.logger.warn(`Auto-disabled blocked plugin ${plugin.pluginName}: ${block.reason}`);
    } catch (error: any) {
      this.logger.error(`Failed to auto-disable blocked plugin ${plugin.pluginName}: ${error.message}`);
    }
  }

  private async readPluginDoc(
    pluginName: string,
    installPath: string | undefined,
    installedVersion: string | undefined,
    fileName: string,
    requestedVersion?: string,
  ): Promise<string | null> {
    if (!installPath || (requestedVersion && requestedVersion !== installedVersion)) {
      const tmpDir = await mkdtemp(join(tmpdir(), 'camera.ui-doc-'));
      try {
        await extractPackage(`${pluginName}@${requestedVersion ?? 'latest'}`, tmpDir);
        const filePath = join(tmpDir, fileName);
        return (await pathExists(filePath)) ? readFile(filePath, 'utf8') : null;
      } catch {
        return null;
      } finally {
        await remove(tmpDir);
      }
    }

    const localPath = join(installPath, fileName);
    return (await pathExists(localPath)) ? readFile(localPath, 'utf8') : null;
  }

  private async getPluginFromNpm(plugin: CameraUiPlugin): Promise<INpmPluginState> {
    const pluginState: INpmPluginState = {
      updateAvailable: false,
      betaUpdateAvailable: false,
    };

    if (plugin.private) {
      return pluginState;
    }

    try {
      return await checkForUpdate(plugin.pluginName, plugin.installedVersion ?? '0.0.0');
    } catch {
      return pluginState;
    }
  }

  private async searchNpmRegistrySingle(query: string): Promise<CameraUiPlugin | undefined> {
    try {
      const pkg = await getPackument(query, { full: true });

      if (!pkg.keywords?.includes('camera-ui-plugin')) {
        return;
      }

      const [catalog, verified, blocklist] = await Promise.all([getCatalog(), getVerified(), getBlocklist()]);

      let plugin: CameraUiPlugin;
      const installedPlugins = this.service.listPlugins();
      const isInstalled = installedPlugins.find((installedPlugin) => installedPlugin.pluginName === pkg.name);

      const latestVersion = pkg['dist-tags'] ? pkg['dist-tags'].latest : undefined;
      const searchPkg: NpmSearchObject = { name: pkg.name, version: latestVersion ?? '', keywords: pkg.keywords };

      if (isInstalled) {
        plugin = isInstalled.info;
        plugin.lastUpdated = pkg.time.modified;

        const block = getBlock(pkg.name, plugin.installedVersion, blocklist);
        if (block) {
          plugin.blocked = block;
          await this.autoDisableBlockedPlugin(isInstalled, block);
        }

        this.enrichPlugin(plugin, searchPkg, catalog, verified);
        return plugin;
      }

      // Blocked plugins are never shown in the store and cannot be installed.
      if (getBlock(pkg.name, latestVersion, blocklist)) {
        return;
      }

      const manifest = latestVersion ? pkg.versions?.[latestVersion] : undefined;
      const packageDisplayName = (pkg as { displayName?: string }).displayName ?? (manifest as { displayName?: string } | undefined)?.displayName;

      plugin = {
        id: '0',
        pluginName: pkg.name,
        private: false,
        displayName: packageDisplayName ?? PluginManager.transformDisplaName(pkg.name),
        description: pkg.description ? pkg.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pkg.name,
        isPython: false,
        isGo: false,
        isNode: true,
        publicPackage: true,
        latestVersion,
        lastUpdated: pkg.time.modified,
        links: {
          npm: `https://www.npmjs.com/package/${pkg.name}`,
          homepage: pkg.homepage,
          repository: pkg.repository?.url,
          bugs: pkg.bugs?.url,
        },
        author: pkg.maintainers[0]?.name,
        license: pkg.license,
        contract: {
          role: PluginRole.SensorProvider,
          provides: [],
          consumes: [],
          interfaces: [],
          name: '',
        },
        os: (manifest as { os?: string[] } | undefined)?.os,
        cpu: (manifest as { cpu?: string[] } | undefined)?.cpu,
        compatible: isPlatformCompatible((manifest as { os?: string[] } | undefined)?.os, (manifest as { cpu?: string[] } | undefined)?.cpu),
      };

      this.enrichPlugin(plugin, searchPkg, catalog, verified);

      const downloads = await getWeeklyDownloads([pkg.name]);
      if (typeof downloads[pkg.name] === 'number') {
        plugin.downloads = { weekly: downloads[pkg.name] };
      }

      return plugin;
    } catch (error: any) {
      if (error.response?.status !== 404) {
        this.logger.error('Failed to search the npm registry:', error.message);
      }
    }
  }

  private isScopedPlugin(pluginName: string): boolean {
    return pluginName.startsWith('@') && pluginName.split('/').length > 0 && pluginName.split('/')[1]?.startsWith('camera-ui-');
  }
}
