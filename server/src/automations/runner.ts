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

export class FlowRunner {
  private context: FlowContext;
  private flow: DBAutomation | null = null;

  private completed = new Set<string>();
  private pending = new Set<string>();

  private resolveCache: Map<string, string> | null = null;
  private suppressVariableWrites = false;

  constructor(
    private api: CameraUiAPI,
    private logger: LoggerService,
  ) {
    this.context = { variables: new Map() };
  }

  public async run(flow: DBAutomation, startNode: DBAutomationNode, context: FlowContext): Promise<void> {
    this.flow = flow;
    this.context = context;
    this.completed = new Set();
    this.pending = new Set();
    seedVariables(this.context);
    this.context.variables.set('flow.startMs', String(Date.now()));
    await this.executeNode(flow, startNode.id);
  }

  private async executeNode(flow: DBAutomation, nodeId: string): Promise<void> {
    if (this.completed.has(nodeId) || this.pending.has(nodeId)) return;

    const incomingEdges = flow.edges.filter((e) => e.target === nodeId);
    if (incomingEdges.some((e) => !this.completed.has(e.source))) return;

    this.pending.add(nodeId);

    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (TRIGGER_TYPES.has(node.type)) {
      this.completed.add(nodeId);
      this.pending.delete(nodeId);
      const outEdges = this.getOutgoingEdges(flow, nodeId);
      await Promise.all(outEdges.map((edge) => this.executeNode(flow, edge.target)));
      return;
    }

    const conditionHandler = CONDITION_HANDLERS[node.type];
    if (conditionHandler) {
      const result = await conditionHandler(this.createActionContext(), node.data);
      this.completed.add(nodeId);
      this.pending.delete(nodeId);

      if (result) {
        const edges = this.getOutgoingEdges(flow, nodeId);
        const target = edges.find((e) => e.sourceHandle === result.handle);
        if (target) await this.executeNode(flow, target.target);
      }
      return;
    }

    const alias = node.data.alias as string | undefined;
    if (alias) {
      const originalSet = this.context.variables.set.bind(this.context.variables);
      const prefix = `${alias}.`;
      this.context.variables.set = (key: string, value: string) => {
        originalSet(key, value);
        originalSet(prefix + key, value);
        return this.context.variables;
      };
      await this.executeAction(node.type, node.data);
      this.context.variables.set = originalSet;
    } else {
      await this.executeAction(node.type, node.data);
    }

    this.completed.add(nodeId);
    this.pending.delete(nodeId);

    const outEdges = this.getOutgoingEdges(flow, nodeId);
    await Promise.all(outEdges.map((edge) => this.executeNode(flow, edge.target)));
  }

  private async executeAction(type: string, data: Record<string, unknown>): Promise<void> {
    const repeat = (data.repeat as number) ?? 1;
    const repeatDelayMs = (data.repeatDelayMs as number) ?? 0;
    const concurrency = (data.repeatConcurrency as number) ?? 1;

    if (repeat > 1) {
      const totalCalls = repeat * concurrency;
      this.logger.trace(`[action] ${type} starting ${repeat}x repeat (concurrency=${concurrency}, total=${totalCalls})`);

      this.resolveCache = new Map();
      this.suppressVariableWrites = true;

      const startMs = Date.now();

      if (concurrency > 1) {
        const streams = Array.from({ length: concurrency }, async () => {
          for (let i = 0; i < repeat; i++) {
            await this.runAction(type, data);
            if (repeatDelayMs > 0 && i < repeat - 1) {
              await new Promise((r) => setTimeout(r, repeatDelayMs));
            }
          }
        });
        await Promise.all(streams);
      } else {
        for (let i = 0; i < repeat; i++) {
          if (i === repeat - 1) this.suppressVariableWrites = false;
          this.context.variables.set('repeat.index', String(i));
          this.context.variables.set('repeat.iteration', String(i + 1));
          this.context.variables.set('repeat.total', String(repeat));
          await this.runAction(type, data);
          if (repeatDelayMs > 0 && i < repeat - 1) {
            await new Promise((r) => setTimeout(r, repeatDelayMs));
          }
        }
      }

      this.resolveCache = null;
      this.suppressVariableWrites = false;
      clearCachedPluginCall();

      const elapsedMs = Date.now() - startMs;
      this.context.variables.set('repeat.elapsedMs', String(elapsedMs));
      this.context.variables.set('repeat.elapsedSec', String((elapsedMs / 1000).toFixed(2)));
      this.context.variables.set('repeat.totalCalls', String(totalCalls));
      this.logger.trace(`[action] ${type} repeat done: ${totalCalls} calls in ${elapsedMs}ms`);
    } else {
      await this.runAction(type, data);
    }
  }

  private async runAction(type: string, data: Record<string, unknown>): Promise<void> {
    const handler = ACTION_HANDLERS[type] ?? UTILITY_HANDLERS[type];
    if (!handler) return;
    await handler(this.createActionContext(), data);
  }

  private createActionContext(): ActionContext {
    return {
      variables: this.context.variables,
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
    if (this.resolveCache) {
      const cached = this.resolveCache.get(template);
      if (cached !== undefined) return cached;
      const result = resolveTemplate(template, this.context.variables);
      this.resolveCache.set(template, result);
      return result;
    }
    return resolveTemplate(template, this.context.variables);
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
