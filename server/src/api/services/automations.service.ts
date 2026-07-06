import { randomBytes } from 'node:crypto';
import { container } from 'tsyringe';

import type { AutomationEngine } from '../../automations/engine.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBAutomation } from '../database/types.js';
import type { CreateAutomationInput, ImportBlueprintInput, PatchAutomationInput } from '../schemas/automations.schema.js';

export class AutomationsService {
  private dbs: Database;
  private logger: LoggerService;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.logger = container.resolve<LoggerService>('logger');
  }

  public list(): DBAutomation[] {
    return [...this.dbs.automationsDB.getRange()].map(({ value }) => value);
  }

  public getById(id: string): DBAutomation | undefined {
    return this.dbs.automationsDB.get(id);
  }

  public async create(input: CreateAutomationInput): Promise<DBAutomation> {
    const automation: DBAutomation = {
      _id: randomBytes(12).toString('hex'),
      name: input.name,
      enabled: input.enabled,
      nodes: this.ensureWebhookSecrets(input.nodes),
      edges: input.edges,
      suppressDuplicates: input.suppressDuplicates,
      singleExecution: input.singleExecution,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.dbs.automationsDB.put(automation._id, automation);

    this.logger.log(`Automation created: ${automation.name} (${automation._id})`);
    this.notifyEngine(automation._id);

    return automation;
  }

  public async update(id: string, input: PatchAutomationInput): Promise<DBAutomation | undefined> {
    const automation = this.getById(id);
    if (!automation) return undefined;

    if (input.name !== undefined) automation.name = input.name;
    if (input.enabled !== undefined) automation.enabled = input.enabled;
    if (input.nodes !== undefined) automation.nodes = this.ensureWebhookSecrets(input.nodes);
    if (input.edges !== undefined) automation.edges = input.edges;
    if (input.suppressDuplicates !== undefined) automation.suppressDuplicates = input.suppressDuplicates;
    if (input.singleExecution !== undefined) automation.singleExecution = input.singleExecution;

    // Clear requiresUpdate flag when flow is edited (user acknowledged the issue)
    automation.requiresUpdate = false;
    automation.updatedAt = Date.now();

    await this.dbs.automationsDB.put(id, automation);
    this.notifyEngine(id);

    return automation;
  }

  public async delete(id: string): Promise<boolean> {
    const automation = this.getById(id);
    if (!automation) return false;

    await this.dbs.automationsDB.remove(id);

    this.logger.log(`Automation deleted: ${automation.name} (${id})`);
    this.notifyEngineDeleted(id);

    return true;
  }

  public async setLastRun(id: string, lastRun: DBAutomation['lastRun']): Promise<void> {
    const automation = this.getById(id);
    if (!automation) return;

    automation.lastRun = lastRun;
    await this.dbs.automationsDB.put(id, automation);
  }

  // Disable any flow whose nodes reference the given camera and flag it for update.
  // Returns the affected flows so callers (e.g. AutomationEngine) can react.
  public async disableFlowsReferencingCamera(cameraId: string): Promise<DBAutomation[]> {
    const affected: DBAutomation[] = [];

    for (const { value: flow } of this.dbs.automationsDB.getRange()) {
      if (flow.requiresUpdate) continue;
      if (!flow.nodes.some((n) => n.data.cameraId === cameraId)) continue;

      flow.requiresUpdate = true;
      flow.enabled = false;
      affected.push(flow);
    }

    if (affected.length) {
      await Promise.all(affected.map((f) => this.dbs.automationsDB.put(f._id, f)));
    }

    return affected;
  }

  public async importBlueprint(input: ImportBlueprintInput): Promise<DBAutomation> {
    // Remap node/edge IDs to avoid collisions
    const idMap = new Map<string, string>();
    const nodes = input.nodes.map((node) => {
      const newId = randomBytes(6).toString('hex');
      idMap.set(node.id, newId);
      return { ...node, id: newId };
    });

    const edges = input.edges.map((edge) => ({
      ...edge,
      id: randomBytes(6).toString('hex'),
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    }));

    return this.create({
      name: input.name,
      enabled: false,
      nodes,
      edges,
      suppressDuplicates: false,
      singleExecution: false,
    });
  }

  public exportBlueprint(id: string): { version: number; name: string; nodes: DBAutomation['nodes']; edges: DBAutomation['edges'] } | undefined {
    const automation = this.getById(id);
    if (!automation) return undefined;

    return {
      version: 1,
      name: automation.name,
      nodes: automation.nodes,
      edges: automation.edges,
    };
  }

  private ensureWebhookSecrets(nodes: DBAutomation['nodes']): DBAutomation['nodes'] {
    return nodes.map((node) => {
      if (node.type === 'trigger-webhook' && !node.data.webhookSecret) {
        return { ...node, data: { ...node.data, webhookSecret: randomBytes(32).toString('hex') } };
      }
      if (node.type === 'trigger-geofence') {
        const data = { ...node.data };
        data.geofenceId ??= randomBytes(12).toString('hex');
        const users = (data.users as string[] | undefined) ?? [];
        const existing = (data.geofenceUserSecrets as Record<string, string> | undefined) ?? {};
        const secrets: Record<string, string> = {};
        for (const username of users) {
          secrets[username] = existing[username] ?? randomBytes(32).toString('hex');
        }
        data.geofenceUserSecrets = secrets;
        return { ...node, data };
      }
      return node;
    });
  }

  private notifyEngine(flowId: string): void {
    try {
      const engine = container.resolve<AutomationEngine>('automationEngine');
      engine.onFlowChanged(flowId);
    } catch (error) {
      this.logger.warn(`Failed to notify automation engine: ${error}`);
    }
  }

  private notifyEngineDeleted(flowId: string): void {
    try {
      const engine = container.resolve<AutomationEngine>('automationEngine');
      engine.onFlowDeleted(flowId);
    } catch (error) {
      this.logger.warn(`Failed to notify automation engine: ${error}`);
    }
  }
}
