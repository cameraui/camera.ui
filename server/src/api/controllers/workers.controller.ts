import { fetchViableNetworkAddresses, isLoopbackAddress } from '@camera.ui/common/network';
import { container } from 'tsyringe';

import { WorkersService } from '../services/workers.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ProxyServer } from '../../rpc/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { WorkerManager } from '../../workers/manager.js';
import type {
  AuthLoginRequest,
  WorkerAssignPluginRequest,
  WorkerAssignRequest,
  WorkerConfigPatchRequest,
  WorkerPairRequest,
  WorkerRemoveRequest,
  WorkerRestartRequest,
  WorkerUnassignPluginRequest,
  WorkerUnassignRequest,
} from '../types/index.js';

export class WorkersController {
  private logger: LoggerService;
  private workersService: WorkersService;
  private workerManager: WorkerManager;

  constructor(_app: FastifyInstance) {
    this.logger = container.resolve<LoggerService>('logger');
    this.workerManager = container.resolve<WorkerManager>('workerManager');
    this.workersService = new WorkersService();
  }

  public async getWorkers(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const workers = this.workerManager.getWorkers();
      return reply.code(200).send(workers);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getConfig(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const configService = container.resolve<ConfigService>('configService');
      const workers = configService.config.workers;

      const suggestedAddresses = fetchViableNetworkAddresses()
        .filter((entry) => !isLoopbackAddress(entry.address))
        .sort((a, b) => Number(b.isPrivate) - Number(a.isPrivate))
        .map((entry) => entry.address);

      return reply.code(200).send({
        enabled: !!workers?.enabled,
        address: workers?.address ?? '',
        port: workers?.port ?? 7422,
        suggestedAddresses,
        pairedWorkers: this.workersService.listCredentials().length,
      });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async patchConfig(req: FastifyRequest<AuthLoginRequest & WorkerConfigPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const configService = container.resolve<ConfigService>('configService');
      const proxyServer = container.resolve<ProxyServer>('proxy');

      const current = configService.config.workers ?? {};
      const wasEnabled = !!current.enabled;
      const prevAddress = current.address ?? '';

      const next = {
        enabled: req.body.enabled ?? wasEnabled,
        address: req.body.address ?? prevAddress,
        port: req.body.port ?? current.port ?? 7422,
      };

      if (next.enabled && !next.address) {
        return reply.code(400).send({ statusCode: 400, message: 'A master address is required to enable workers' });
      }

      configService.writeConfig({ workers: next });

      // A changed address must land in the cert SANs before the acceptor
      // restarts, so a worker can verify the new address.
      if (next.enabled && next.address !== prevAddress) {
        configService.reissueSslCertificate();
      }

      if (next.enabled && !wasEnabled) {
        await this.workerManager.enable();
      } else if (!next.enabled && wasEnabled) {
        await this.workerManager.disable();
      } else if (next.enabled) {
        // Enabled throughout — address/port change: restart only the acceptor.
        await proxyServer.applyLeafNodeAuth();
      }

      this.logger.log(`Workers config updated: enabled=${next.enabled}, address=${next.address}, port=${next.port}`);

      return reply.code(200).send(next);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async createPairing(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const configService = container.resolve<ConfigService>('configService');
      const workersConfig = configService.config.workers;

      if (!workersConfig?.enabled) {
        return reply.code(400).send({ statusCode: 400, message: 'Workers are not enabled on this instance' });
      }

      const pairing = await this.workersService.createPairingCode();
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const address = workersConfig.address || null;

      return reply.code(200).send({
        code: pairing.code,
        expiresAt: pairing.expiresAt,
        address,
        leafPort: workersConfig.port ?? 7422,
        apiPort: configService.config.port,
      });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async pair(req: FastifyRequest<WorkerPairRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const configService = container.resolve<ConfigService>('configService');
      const workersConfig = configService.config.workers;

      if (!workersConfig?.enabled) {
        return reply.code(403).send({ statusCode: 403, message: 'Workers are not enabled on this instance' });
      }

      const { code, agentId, name } = req.body;

      if (!this.workersService.isPairingCodeValid(code)) {
        this.logger.warn(`Worker pairing rejected for ${name} (${agentId}): invalid or expired code`);
        return reply.code(401).send({ statusCode: 401, message: 'Invalid or expired pairing code' });
      }

      const credential = await this.workersService.issueCredentials(agentId, name);
      await this.workerManager.noteWorkerPaired(agentId, name);

      // Bring the leaf listener up to date so the worker can connect right away.
      const proxyServer = container.resolve<ProxyServer>('proxy');
      await proxyServer.applyLeafNodeAuth();

      // Burn the code only now — a failure above must not invalidate it.
      await this.workersService.consumePairingCode(code);

      this.logger.log(`Worker paired: ${name} (${agentId})`);

      return reply.code(200).send({
        user: credential.user,
        secret: credential.secret,
        ca: configService.ssl.ca.toString('utf-8'),
        leafPort: workersConfig.port ?? 7422,
      });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async removeWorker(req: FastifyRequest<AuthLoginRequest & WorkerRemoveRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.workerManager.removeWorker(req.params.agentId);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async assignCamera(req: FastifyRequest<AuthLoginRequest & WorkerAssignRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { cameraId, agentId } = req.body;
      await this.workerManager.assignCamera(cameraId, agentId);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async unassignCamera(req: FastifyRequest<AuthLoginRequest & WorkerUnassignRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { cameraId } = req.body;
      await this.workerManager.unassignCamera(cameraId);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async assignPlugin(req: FastifyRequest<AuthLoginRequest & WorkerAssignPluginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { pluginName, agentId } = req.body;
      await this.workerManager.assignPlugin(pluginName, agentId);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async unassignPlugin(req: FastifyRequest<AuthLoginRequest & WorkerUnassignPluginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { pluginName } = req.body;
      await this.workerManager.unassignPlugin(pluginName);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async restartWorker(req: FastifyRequest<AuthLoginRequest & WorkerRestartRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.workerManager.restartWorker(req.params.agentId);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
