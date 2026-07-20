import { ACTION_HANDLERS, clearCachedPluginCall } from './actions/index.js';
import { CONDITION_HANDLERS, TRIGGER_TYPES } from './conditions/index.js';
import { resolveTemplate, seedVariables } from './context.js';
import { UTILITY_HANDLERS } from './utilities/index.js';

import type { CameraUiAPI } from '../api.js';
import type { DBAutomation, DBAutomationEdge, DBAutomationNode } from '../api/database/types.js';
import type { CameraController } from '../camera/controller.js';
import type { LoggerService } from '../services/logger/index.js';
import type { ActionContext } from './actions/index.js';
import type { FlowContext } from './context.js';
import type { RunTrace } from './trace.js';

class AliasedVariables extends Map<string, string> {
  constructor(
    private base: Map<string, string>,
    private prefix: string,
  ) {
    super();
  }

  override get(key: string): string | undefined {
    return this.base.get(key);
  }

  override has(key: string): boolean {
    return this.base.has(key);
  }

  override set(key: string, value: string): this {
    this.base.set(key, value);
    this.base.set(this.prefix + key, value);
    return this;
  }
}

export class FlowRunner {
  private context: FlowContext;
  private flow: DBAutomation | null = null;

  private completed = new Set<string>();
  private pending = new Set<string>();
  private skipped = new Set<string>();
  private deadEdges = new Set<string>();

  private suppressVariableWrites = false;

  constructor(
    private api: CameraUiAPI,
    private logger: LoggerService,
    private trace?: RunTrace,
  ) {
    this.context = { variables: new Map() };
  }

  public async run(flow: DBAutomation, startNode: DBAutomationNode, context: FlowContext): Promise<void> {
    this.flow = flow;
    this.context = context;
    this.completed = new Set();
    this.pending = new Set();
    this.skipped = new Set();
    this.deadEdges = new Set();
    seedVariables(this.context);
    this.context.variables.set('flow.startMs', String(Date.now()));

    // only one trigger fires per run, the others count as skipped so fan-in joins resolve
    const inactiveTriggers = flow.nodes.filter((n) => n.id !== startNode.id && TRIGGER_TYPES.has(n.type));
    for (const node of inactiveTriggers) this.markSkipped(flow, node.id);
    for (const node of inactiveTriggers) {
      await Promise.all(this.getOutgoingEdges(flow, node.id).map((edge) => this.executeNode(flow, edge.target)));
    }

    await this.executeNode(flow, startNode.id);
  }

  private async executeNode(flow: DBAutomation, nodeId: string): Promise<void> {
    if (this.completed.has(nodeId) || this.pending.has(nodeId) || this.skipped.has(nodeId)) return;

    const incomingEdges = flow.edges.filter((e) => e.target === nodeId);
    const liveEdges = incomingEdges.filter((e) => !this.deadEdges.has(e.id));

    if (incomingEdges.length > 0 && liveEdges.length === 0) {
      this.markSkipped(flow, nodeId);
      await Promise.all(this.getOutgoingEdges(flow, nodeId).map((edge) => this.executeNode(flow, edge.target)));
      return;
    }

    if (liveEdges.some((e) => !this.completed.has(e.source))) return;

    this.pending.add(nodeId);

    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (TRIGGER_TYPES.has(node.type)) {
      this.completed.add(nodeId);
      this.pending.delete(nodeId);
      this.trace?.addEntry({ nodeId, nodeType: node.type, status: 'completed', startedAt: Date.now() });
      const outEdges = this.getOutgoingEdges(flow, nodeId);
      await Promise.all(outEdges.map((edge) => this.executeNode(flow, edge.target)));
      return;
    }

    const conditionHandler = CONDITION_HANDLERS[node.type];
    if (conditionHandler) {
      const startedAt = Date.now();
      const result = await conditionHandler(this.createActionContext(), node.data);
      this.completed.add(nodeId);
      this.pending.delete(nodeId);
      this.trace?.addEntry({
        nodeId,
        nodeType: node.type,
        status: 'completed',
        ...(result ? { handle: result.handle } : {}),
        startedAt,
        durationMs: Date.now() - startedAt,
      });

      const edges = this.getOutgoingEdges(flow, nodeId);
      const taken = result ? edges.filter((e) => e.sourceHandle === result.handle) : [];
      for (const edge of edges) {
        if (!taken.includes(edge)) this.deadEdges.add(edge.id);
      }
      await Promise.all(edges.map((edge) => this.executeNode(flow, edge.target)));
      return;
    }

    const startedAt = Date.now();
    try {
      await this.executeAction(node.type, node.data);
    } catch (error) {
      this.trace?.addEntry({
        nodeId,
        nodeType: node.type,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        startedAt,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }

    this.completed.add(nodeId);
    this.pending.delete(nodeId);
    this.trace?.addEntry({ nodeId, nodeType: node.type, status: 'completed', startedAt, durationMs: Date.now() - startedAt });

    const outEdges = this.getOutgoingEdges(flow, nodeId);
    await Promise.all(outEdges.map((edge) => this.executeNode(flow, edge.target)));
  }

  private markSkipped(flow: DBAutomation, nodeId: string): void {
    if (this.skipped.has(nodeId)) return;
    this.skipped.add(nodeId);
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (node && !TRIGGER_TYPES.has(node.type)) {
      this.trace?.addEntry({ nodeId, nodeType: node.type, status: 'skipped', startedAt: Date.now() });
    }
    for (const edge of this.getOutgoingEdges(flow, nodeId)) {
      this.deadEdges.add(edge.id);
    }
  }

  private async executeAction(type: string, data: Record<string, unknown>): Promise<void> {
    const repeat = (data.repeat as number) ?? 1;
    const repeatDelayMs = (data.repeatDelayMs as number) ?? 0;
    const concurrency = (data.repeatConcurrency as number) ?? 1;
    const alias = data.alias as string | undefined;

    if (repeat > 1) {
      const totalCalls = repeat * concurrency;
      this.logger.trace(`[action] ${type} starting ${repeat}x repeat (concurrency=${concurrency}, total=${totalCalls})`);

      const startMs = Date.now();
      this.context.variables.set('repeat.total', String(repeat));

      if (concurrency > 1) {
        // parallel streams race their writes anyway, the last finisher wins
        const streams = Array.from({ length: concurrency }, async () => {
          for (let i = 0; i < repeat; i++) {
            await this.runAction(type, data, alias);
            if (repeatDelayMs > 0 && i < repeat - 1) {
              await new Promise((r) => setTimeout(r, repeatDelayMs));
            }
          }
        });
        await Promise.all(streams);
      } else {
        this.suppressVariableWrites = true;
        for (let i = 0; i < repeat; i++) {
          if (i === repeat - 1) this.suppressVariableWrites = false;
          this.context.variables.set('repeat.index', String(i));
          this.context.variables.set('repeat.iteration', String(i + 1));
          await this.runAction(type, data, alias);
          if (repeatDelayMs > 0 && i < repeat - 1) {
            await new Promise((r) => setTimeout(r, repeatDelayMs));
          }
        }
        this.suppressVariableWrites = false;
      }

      clearCachedPluginCall();

      const elapsedMs = Date.now() - startMs;
      this.context.variables.set('repeat.elapsedMs', String(elapsedMs));
      this.context.variables.set('repeat.elapsedSec', String((elapsedMs / 1000).toFixed(2)));
      this.context.variables.set('repeat.totalCalls', String(totalCalls));
      this.logger.trace(`[action] ${type} repeat done: ${totalCalls} calls in ${elapsedMs}ms`);
    } else {
      await this.runAction(type, data, alias);
    }
  }

  private async runAction(type: string, data: Record<string, unknown>, alias?: string): Promise<void> {
    const handler = ACTION_HANDLERS[type] ?? UTILITY_HANDLERS[type];
    if (!handler) {
      this.logger.warn(`Automation "${this.flow?.name ?? ''}": unknown node type "${type}" skipped`);
      return;
    }
    await handler(this.createActionContext(alias), data);
  }

  private createActionContext(alias?: string): ActionContext {
    const variables = alias ? new AliasedVariables(this.context.variables, `${alias}.`) : this.context.variables;
    return {
      variables,
      api: this.api,
      logger: this.logger,
      suppressVariableWrites: this.suppressVariableWrites,
      resolve: (template: string) => this.resolve(template),
      getCamera: (cameraId: string) => this.getCamera(cameraId),
      flowId: this.flow?._id ?? '',
      flowName: this.flow?.name ?? '',
    };
  }

  private resolve(template: string): string {
    if (!template) return '';
    return resolveTemplate(template, this.context.variables, (message) => {
      this.trace?.addWarning(message);
      this.logger.debug(`Automation "${this.flow?.name ?? ''}": ${message}`);
    });
  }

  private getCamera(cameraId: string): CameraController {
    const camera = this.api.getCamera(cameraId);
    if (!camera) throw new Error(`Camera "${cameraId}" not found`);
    return camera;
  }

  private getOutgoingEdges(flow: DBAutomation, nodeId: string): DBAutomationEdge[] {
    return flow.edges.filter((e) => e.source === nodeId);
  }
}
