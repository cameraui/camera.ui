import { container } from 'tsyringe';

import { getPluginMethodsForClient } from '../../automations/pluginMethodRegistry.js';
import { getAutomationBlueprint, getAutomationCatalog, invalidateAutomationRegistry } from '../../utils/automation-registry/index.js';
import { AutomationsService } from '../services/automations.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AutomationEngine } from '../../automations/engine.js';
import type { DBAutomation } from '../database/types.js';
import type {
  AuthLoginRequest,
  AutomationsCreateRequest,
  AutomationsImportRequest,
  AutomationsParamsGeofenceRequest,
  AutomationsParamsRequest,
  AutomationsParamsWebhookRequest,
  AutomationsPatchRequest,
  AutomationsStoreParamsRequest,
  AutomationsStoreQueryRequest,
} from '../types/index.js';

function isAdminRequest(req: FastifyRequest<AuthLoginRequest>): boolean {
  const role = req.locals.user?.role;
  return role === 'admin' || role === 'master';
}

function maskAutomation<T extends Pick<DBAutomation, 'nodes'>>(automation: T): T {
  return {
    ...automation,
    nodes: automation.nodes.map((node) => {
      const data = { ...node.data };
      delete (data as { webhookSecret?: string }).webhookSecret;
      delete (data as { geofenceId?: string }).geofenceId;
      delete (data as { geofenceUserSecrets?: unknown }).geofenceUserSecrets;
      return { ...node, data };
    }),
  };
}

export class AutomationsController {
  private service: AutomationsService;

  constructor(_app: FastifyInstance) {
    this.service = new AutomationsService();
  }

  public list(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      const automations = this.service.list();
      const result = isAdminRequest(req) ? automations : automations.map(maskAutomation);
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public getById(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const automation = this.service.getById(req.params.id);
      if (!automation) {
        return reply.code(404).send({ statusCode: 404, message: 'Automation not found' });
      }
      return reply.code(200).send(isAdminRequest(req) ? automation : maskAutomation(automation));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async create(req: FastifyRequest<AuthLoginRequest & AutomationsCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const automation = await this.service.create(req.body);
      return reply.code(201).send(automation);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async update(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest & AutomationsPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const automation = await this.service.update(req.params.id, req.body);
      if (!automation) {
        return reply.code(404).send({ statusCode: 404, message: 'Automation not found' });
      }
      return reply.code(200).send(automation);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async delete(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const success = await this.service.delete(req.params.id);
      if (!success) {
        return reply.code(404).send({ statusCode: 404, message: 'Automation not found' });
      }
      return reply.code(200).send({ statusCode: 200, message: 'Automation deleted' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async importBlueprint(req: FastifyRequest<AuthLoginRequest & AutomationsImportRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const automation = await this.service.importBlueprint(req.body);
      return reply.code(201).send(automation);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public exportBlueprint(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const blueprint = this.service.exportBlueprint(req.params.id);
      if (!blueprint) {
        return reply.code(404).send({ statusCode: 404, message: 'Automation not found' });
      }
      // a blueprint is shareable, so secrets are always stripped regardless of role
      return reply.code(200).send(maskAutomation(blueprint));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async storeList(req: FastifyRequest<AuthLoginRequest & AutomationsStoreQueryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    if (req.query.refresh) {
      invalidateAutomationRegistry();
    }

    const catalog = await getAutomationCatalog();
    const result = Object.entries(catalog).map(([id, entry]) => ({ id, ...entry }));
    return reply.code(200).send(result);
  }

  public async storeItem(req: FastifyRequest<AuthLoginRequest & AutomationsStoreParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const catalog = await getAutomationCatalog();
    const entry = catalog[req.params.id];
    if (!entry) {
      return reply.code(404).send({ statusCode: 404, message: 'Automation not found in store' });
    }

    // the catalog stores the blueprint path as `blueprints/<file>`; only the basename is fetched
    const file = entry.blueprint.split('/').pop() ?? '';
    const blueprint = await getAutomationBlueprint(file);
    if (!blueprint) {
      return reply.code(404).send({ statusCode: 404, message: 'Blueprint not found in store' });
    }

    return reply.code(200).send({ id: req.params.id, ...entry, blueprint });
  }

  public async trigger(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const engine = container.resolve<AutomationEngine>('automationEngine');
      const output = await engine.triggerManually(req.params.id);
      return reply.code(200).send({ statusCode: 200, message: 'Automation triggered', output });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public pluginMethods(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.code(200).send(getPluginMethodsForClient());
  }

  public async webhook(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest & AutomationsParamsWebhookRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const engine = container.resolve<AutomationEngine>('automationEngine');
      const result = await engine.triggerWebhook(req.params.webhookId, req.body, req.method, req.headers as Record<string, string>);

      if (result.error) {
        return reply.code(401).send({ statusCode: 401, message: result.error });
      }
      if (!result.triggered) {
        return reply.code(404).send({ statusCode: 404, message: 'Webhook not found' });
      }
      return reply.code(200).send({ statusCode: 200, message: 'Webhook processed' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async location(req: FastifyRequest<AuthLoginRequest & AutomationsParamsRequest & AutomationsParamsGeofenceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const engine = container.resolve<AutomationEngine>('automationEngine');
      const result = await engine.triggerGeofence(req.params.geofenceId, req.body, req.headers as Record<string, string>);

      if (result.error) {
        return reply.code(401).send({ statusCode: 401, message: result.error });
      }
      if (!result.triggered) {
        return reply.code(200).send({ statusCode: 200, message: 'Location received' });
      }
      return reply.code(200).send({ statusCode: 200, message: 'Geofence triggered' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
