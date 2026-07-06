import { orderBy } from '@camera.ui/common/utils';
import { createReadStream, truncate } from 'node:fs';
import { Readable } from 'node:stream';
import { container } from 'tsyringe';

import { createSourceName } from '../../utils/camera.js';
import { CamerasService } from '../services/cameras.service.js';
import { PluginsService } from '../services/plugins.service.js';
import { resolvePluginName } from '../utils/plugin.js';

import type { AssignedPlugin, ProbeConfig, SchemaConfig } from '@camera.ui/sdk';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CameraUiAPI } from '../../api.js';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { Go2RTCProbe } from '../../go2rtc/types.js';
import type { ConfigService } from '../../services/config/index.js';
import type { DBCamera } from '../database/types.js';
import type {
  AuthLoginRequest,
  CameraLineInsertPatchRequest,
  CameraProbeSourceQueryRequest,
  CameraSnapshotQueryRequest,
  CameraSourceParamsRequest,
  CameraZoneInsertPatchRequest,
  CamerasExtensionsParamsRequest,
  CamerasExtensionsRequest,
  CamerasInsertRequest,
  CamerasParamsIdRequest,
  CamerasParamsRequest,
  CamerasPatchRequest,
  CamerasPreviewRequest,
  CamerasSensorStorageParamsRequest,
  CamerasStreamRequest,
  PaginationRequest,
  PluginExtension,
  PluginExtensionConfig,
  StoragePatchRequest,
  StorageSetRequest,
  StorageSubmitRequest,
} from '../types/index.js';

export class CamerasController {
  private api: CameraUiAPI;
  private go2rtcApi: Go2RtcApi;
  private configService: ConfigService;
  private service: CamerasService;
  private pluginsService: PluginsService;

  constructor(private app: FastifyInstance) {
    this.service = new CamerasService();
    this.pluginsService = new PluginsService();

    this.api = container.resolve<CameraUiAPI>('api');
    this.configService = container.resolve<ConfigService>('configService');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
  }

  public listRooms(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.service.getRooms());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public getByName(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      return reply.code(200).send(camera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getZones(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      return reply.code(200).send(camera.detectionZones);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchZones(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest & CameraZoneInsertPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const newZone = await this.service.patchZones(req.params.cameraname, req.body);

      return reply.code(200).send(newZone);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getLines(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      return reply.code(200).send(camera.detectionLines ?? []);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchLines(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest & CameraLineInsertPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const updated = await this.service.patchLines(req.params.cameraname, req.body);

      return reply.code(200).send(updated);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getExtensionsByName(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const cameraExtensions: PluginExtension[] = [];

      camera.plugins.forEach((extension: AssignedPlugin) => {
        const plugin = this.pluginsService.getPluginByName(extension.name);
        if (plugin) {
          cameraExtensions.push({
            pluginName: plugin.pluginName,
            displayName: plugin.displayName,
            contract: plugin.contract,
          });
        }
      });

      const ordered = orderBy(cameraExtensions, ['displayName'], ['asc', 'asc']);

      return reply.code(200).send(ordered);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getExtensionConfigByName(req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const proxy = cameraDevice.storageProxy(plugin.id);
      const cameraSchemaConfig = await proxy.getConfig();

      const cameraExtension: PluginExtensionConfig = {
        pluginName: plugin.pluginName,
        displayName: plugin.displayName,
        contract: plugin.contract,
        ...cameraSchemaConfig,
      };

      return reply.code(200).send(cameraExtension);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchExtensionConfigByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & StoragePatchRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const proxy = cameraDevice.storageProxy(plugin.id);
      await proxy.setConfig(req.body);

      return reply.code(200).send(req.body);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async setExtensionConfigByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & StorageSetRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const proxy = cameraDevice.storageProxy(plugin.id);
      await proxy.setValue<undefined>(req.body.key, undefined);

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async submitExtensionConfigByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & StorageSubmitRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const proxy = cameraDevice.storageProxy(plugin.id);
      const response = await proxy.submitValue(req.body.key, req.body.payload);

      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async probeSourceByName(
    req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest & CameraSourceParamsRequest & CameraProbeSourceQueryRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);
    const cameraController = this.api.getCamera(camera?._id ?? '');

    if (!camera || !cameraController) {
      return reply.code(404).send({
        statusCode: 404,
        message: 'Camera not exists',
      });
    }

    const source = cameraController.sources.find((s) => s.name === req.params.sourcename);

    if (!source) {
      return reply.code(404).send({
        statusCode: 404,
        message: 'Source not exists',
      });
    }

    const probeConfig: ProbeConfig = {
      video: req.query.video,
      audio: req.query.audio,
      microphone: req.query.microphone,
    };

    let probe: Go2RTCProbe;

    try {
      probe = await this.service.probeCameraSource(camera, source, probeConfig, req.query.refresh);
      return reply.code(200).send({ rtspUrl: source.urls.rtsp.base, onvifUrl: source.urls.rtsp.onvif, probe });
    } catch {
      return reply.code(200).send({ rtspUrl: source.urls.rtsp.base, onvifUrl: source.urls.rtsp.onvif, probe: { producers: [], consumers: [] } });
    }
  }

  public async streamSourceInfoByName(
    req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest & CameraSourceParamsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);
      const cameraController = this.api.getCamera(camera?._id ?? '');

      if (!camera || !cameraController) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const source = cameraController.sources.find((s) => s.name === req.params.sourcename);

      if (!source) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Source not exists',
        });
      }

      const streamInfo = await this.service.streamSourceInfo(camera, source);
      return reply.code(200).send(streamInfo);
    } catch (error: any) {
      return reply.code(error.response?.status ?? 500).send({
        statusCode: error.response?.status ?? 500,
        message: error.response?.statusText ?? error.message,
      });
    }
  }

  public async getSnapshotByName(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest & CameraSnapshotQueryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);
      const cameraController = this.api.getCamera(camera?._id ?? '');

      if (!camera || !cameraController) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const source = cameraController.snapshotSource ?? cameraController.streamSource;
      const snapshot = await cameraController.snapshot(source._id, req.query.forceNew);
      const base64string = snapshot ? Buffer.from(snapshot).toString('base64') : undefined;

      reply.header('Content-Type', 'image/jpeg');
      return reply.code(200).send(base64string);
    } catch (error: any) {
      return reply.code(error.response?.status ?? 500).send({
        statusCode: error.response?.status ?? 500,
        message: error.response?.statusText ?? error.message,
      });
    }
  }

  public async getSnapshotById(req: FastifyRequest<AuthLoginRequest & CamerasParamsIdRequest & CameraSnapshotQueryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findById(req.params.cameraid);
      const cameraController = this.api.getCamera(camera?._id ?? '');

      if (!camera || !cameraController) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const source = cameraController.snapshotSource ?? cameraController.streamSource;
      const snapshot = await cameraController.snapshot(source._id, req.query.forceNew);
      const base64string = snapshot ? Buffer.from(snapshot).toString('base64') : undefined;

      reply.header('Content-Type', 'image/jpeg');
      return reply.code(200).send(base64string);
    } catch (error: any) {
      return reply.code(error.response?.status ?? 500).send({
        statusCode: error.response?.status ?? 500,
        message: error.response?.statusText ?? error.message,
      });
    }
  }

  public async insert(req: FastifyRequest<AuthLoginRequest & CamerasInsertRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.body.name) ?? this.service.findById(req.body.name);

      if (camera) {
        return reply.code(409).send({
          statusCode: 409,
          message: 'Camera already exists',
        });
      }

      const existingGo2RtcSources = Object.keys(this.configService.go2rtcConfig.streams ?? {});

      if (req.body.sources.some((source) => existingGo2RtcSources.includes(createSourceName(req.body.name, source.name)))) {
        return reply.code(409).send({
          statusCode: 409,
          message: 'Go2Rtc Source already exist',
        });
      }

      const newCamera = await this.service.createCamera(req.body);

      return reply.code(201).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async preview(req: FastifyRequest<AuthLoginRequest & CamerasPreviewRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const sourceName: string = Math.random().toString(36).substring(7);
    const streamSource = req.body.url;

    try {
      await this.go2rtcApi.streamsRoute.createStream({
        name: sourceName,
        src: [streamSource],
      });

      const img = await this.go2rtcApi.snapshotRoute.jpeg({ src: sourceName });

      await this.go2rtcApi.streamsRoute.deleteStream({
        src: sourceName,
      });

      if (!img.byteLength) {
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to take snapshot',
        });
      }

      reply.header('Content-Type', 'image/jpeg');
      return reply.code(201).send(Buffer.from(img).toString('base64'));
    } catch (error: any) {
      try {
        await this.go2rtcApi.streamsRoute.deleteStream({
          src: sourceName,
        });
      } catch {
        //
      }

      return reply.code(error.response?.status ?? 500).send({
        statusCode: error.response?.status ?? 500,
        message: error.response?.statusText ?? error.message,
      });
    }
  }

  public list(_req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | DBCamera[] {
    try {
      const result = this.service.list();
      const ordered = orderBy(result, ['name'], ['asc']);

      return ordered;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getStreamUrl(req: FastifyRequest<CamerasStreamRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.api.getCamera(req.params.cameraid);
      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const source = camera.sources.find((s) => s.name === req.params.sourcename);
      if (!source) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Source not exists',
        });
      }

      const streamUrl = await camera.streamUrl(source._id);
      if (!streamUrl) {
        // No custom stream URL from plugin, client should use default go2rtc URLs
        return reply.code(404).send({
          statusCode: 404,
          message: 'Custom stream URL not available, use default source URLs',
        });
      }

      return reply.code(200).send({ streamUrl });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchByName(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest & CamerasPatchRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const newCamera = await this.service.patchCameraByName(req.params.cameraname, req.body);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public clearLog(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      const cameraController = this.api.getCamera(req.params.cameraname);

      if (!cameraController) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      truncate(cameraController.logPath, (error) => {
        if (error) {
          return reply.code(500).send({
            statusCode: 500,
            message: error.message,
          });
        }

        this.app.io.of('/logs').emit('clear-camera-log', cameraController.name);

        return reply.code(204).send();
      });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public downloadLog(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      const cameraController = this.api.getCamera(req.params.cameraname);

      if (!cameraController) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const buffer = new Readable();
      buffer._read = () => {};

      const readStream = createReadStream(cameraController.logPath);

      readStream.on('data', (data) => {
        buffer.push(data.toString('utf8').replace(/\x1b\[[0-9;]*m/g, ''));
      });

      readStream.on('end', () => {
        buffer.push(null);
      });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename=camera.ui.${cameraController.name.replace(/ /g, '_')}.log.txt`);

      return reply.code(200).send(buffer);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async enableExtensionByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & CamerasExtensionsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const newCamera = await this.service.enableAssignmentByName(req.params.cameraname, pluginName, req.query.type);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async disableExtensionByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & CamerasExtensionsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const newCamera = await this.service.disableAssignmentByName(req.params.cameraname, pluginName, req.query.type);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async addExtensionByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & CamerasExtensionsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const newCamera = await this.service.addPluginByName(req.params.cameraname, pluginName, req.query.type);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async activateExtensionByName(req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const newCamera = await this.service.activatePluginByName(req.params.cameraname, pluginName);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async deactivateExtensionByName(req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const newCamera = await this.service.removePluginByName(req.params.cameraname, pluginName);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeExtensionByName(
    req: FastifyRequest<AuthLoginRequest & CamerasExtensionsParamsRequest & CamerasExtensionsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      const newCamera = await this.service.removePluginByName(req.params.cameraname, pluginName);

      return reply.code(200).send(newCamera);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeByName(req: FastifyRequest<AuthLoginRequest & CamerasParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      await this.service.removeByName(req.params.cameraname);

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeAll(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.removeAll();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getSensorConfigByName(req: FastifyRequest<AuthLoginRequest & CamerasSensorStorageParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const sensorId = req.params.sensorId;
      const proxy = cameraDevice.sensorStorageProxy(plugin.id, sensorId);

      let schemaConfig: SchemaConfig = { schema: [], config: {} };

      try {
        schemaConfig = await proxy.getConfig();
      } catch {
        // No storage registered for this sensor - return empty schema
      }

      const sensorExtension: PluginExtensionConfig = {
        pluginName: plugin.pluginName,
        displayName: plugin.displayName,
        contract: plugin.contract,
        ...schemaConfig,
      };

      return reply.code(200).send(sensorExtension);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchSensorConfigByName(
    req: FastifyRequest<AuthLoginRequest & CamerasSensorStorageParamsRequest & StoragePatchRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const sensorId = req.params.sensorId;
      const proxy = cameraDevice.sensorStorageProxy(plugin.id, sensorId);
      await proxy.setConfig(req.body);

      return reply.code(200).send(req.body);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async setSensorConfigByName(
    req: FastifyRequest<AuthLoginRequest & CamerasSensorStorageParamsRequest & StorageSetRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const sensorId = req.params.sensorId;
      const proxy = cameraDevice.sensorStorageProxy(plugin.id, sensorId);
      await proxy.setValue<undefined>(req.body.key, undefined);

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async submitSensorConfigByName(
    req: FastifyRequest<AuthLoginRequest & CamerasSensorStorageParamsRequest & StorageSubmitRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const camera = this.service.findByName(req.params.cameraname) ?? this.service.findById(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const pluginName = resolvePluginName(req.params);
      const plugin = this.pluginsService.getPluginByName(pluginName);
      const cameraDevice = this.api.getCamera(camera._id);

      if (!plugin) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Plugin not exists',
        });
      }

      if (!cameraDevice) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const sensorId = req.params.sensorId;
      const proxy = cameraDevice.sensorStorageProxy(plugin.id, sensorId);
      const response = await proxy.submitValue(req.body.key, req.body.payload);

      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }
}
