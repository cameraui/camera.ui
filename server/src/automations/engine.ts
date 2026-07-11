import { createHmac, timingSafeEqual } from 'node:crypto';
import { container } from 'tsyringe';

import { AutomationsService } from '../api/services/automations.service.js';
import { UsersService } from '../api/services/users.service.js';
import { createEmptyContext } from './context.js';
import { haversineDistance } from './haversine.js';
import { FlowRunner } from './runner.js';
import { registerGeofence, registerWebhook, scheduleTimer, subscribeDetection, subscribeMqtt, subscribeSensor, subscribeSystem } from './triggers/index.js';

import type { Disposable } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../api.js';
import type { DBAutomation, DBAutomationNode } from '../api/database/types.js';
import type { InternalEventBus } from '../internal-bus.js';
import type { LoggerService } from '../services/logger/index.js';
import type { FlowContext } from './context.js';
import type { GeofenceMapping, GeofenceState, TriggerContext, WebhookMapping } from './triggers/index.js';

export class AutomationEngine {
  private api: CameraUiAPI;
  private logger: LoggerService;
  private userService: UsersService;
  private automationsService: AutomationsService;

  private subscriptions = new Map<string, Disposable[]>();
  private schedules = new Map<string, NodeJS.Timeout[]>();
  private webhookMap = new Map<string, WebhookMapping>();
  private geofenceMap = new Map<string, GeofenceMapping>();
  private geofenceStates = new Map<string, GeofenceState>();
  private runningFlows = new Set<string>();
  private lastEventData = new Map<string, string>();

  constructor() {
    container.registerInstance('automationEngine', this);

    this.api = container.resolve<CameraUiAPI>('api');
    this.logger = container.resolve<LoggerService>('logger');
    this.userService = new UsersService();
    this.automationsService = new AutomationsService();
  }

  public async start(): Promise<void> {
    const enabledFlows = this.automationsService.list().filter((a) => a.enabled);

    for (const flow of enabledFlows) {
      this.registerTriggers(flow);
    }

    this.subscribeCameraDeletion();

    this.logger.log(`Automation engine started, ${enabledFlows.length} flow(s) active`);
  }

  public stop(): void {
    for (const flowId of this.subscriptions.keys()) {
      this.unregisterTriggers(flowId);
    }
    this.logger.log('Automation engine stopped');
  }

  public onFlowChanged(flowId: string): void {
    const flow = this.automationsService.getById(flowId);
    this.logger.debug(`Automation flow changed: ${flowId} (enabled=${flow?.enabled}, name="${flow?.name}")`);

    // Register new triggers first, then dispose old ones to avoid missing events
    const oldSubs = this.subscriptions.get(flowId);
    const oldTimers = this.schedules.get(flowId);
    this.subscriptions.delete(flowId);
    this.schedules.delete(flowId);

    for (const [webhookId, mapping] of this.webhookMap) {
      if (mapping.flowId === flowId) this.webhookMap.delete(webhookId);
    }

    for (const [geofenceId, mapping] of this.geofenceMap) {
      if (mapping.flowId === flowId) {
        this.geofenceMap.delete(geofenceId);
        for (const key of this.geofenceStates.keys()) {
          if (key.startsWith(`${geofenceId}:`)) this.geofenceStates.delete(key);
        }
      }
    }

    if (flow?.enabled) {
      this.registerTriggers(flow);
    }

    if (oldSubs) {
      for (const sub of oldSubs) sub.dispose();
    }
    if (oldTimers) {
      for (const timer of oldTimers) clearInterval(timer);
    }

    this.lastEventData.delete(flowId);
  }

  public onFlowDeleted(flowId: string): void {
    this.unregisterTriggers(flowId);
  }

  public async triggerManually(flowId: string): Promise<Record<string, string> | undefined> {
    const flow = this.automationsService.getById(flowId);
    if (!flow) throw new Error('Automation not found');

    const triggerNode = flow.nodes.find((n) => n.type === 'trigger-manual') ?? flow.nodes[0];
    if (!triggerNode) throw new Error('No nodes in automation');

    const context = createEmptyContext();
    await this.executeFlow(flow, triggerNode, context);

    const outputStr = context.variables.get('output');
    if (outputStr) {
      try {
        return JSON.parse(outputStr) as Record<string, string>;
      } catch {
        // ignore
      }
    }
    return undefined;
  }

  public async triggerWebhook(webhookId: string, body: unknown, method: string, headers: Record<string, string>): Promise<{ triggered: boolean; error?: string }> {
    const mapping = this.webhookMap.get(webhookId);
    if (!mapping) return { triggered: false };

    const signature = headers['x-webhook-signature'] ?? headers['X-Webhook-Signature'];
    if (!signature) return { triggered: false, error: 'Missing X-Webhook-Signature header' };

    const payload = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    const expected = createHmac('sha256', mapping.secret ?? '')
      .update(payload)
      .digest('hex');

    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return { triggered: false, error: 'Invalid signature' };
      }
    } catch {
      return { triggered: false, error: 'Invalid signature format' };
    }

    const flow = this.automationsService.getById(mapping.flowId);
    if (!flow?.enabled) return { triggered: false };

    const triggerNode = flow.nodes.find((n) => n.id === mapping.nodeId);
    if (!triggerNode) return { triggered: false };

    const context = createEmptyContext();
    context.webhook = { body, method, headers };
    await this.executeFlow(flow, triggerNode, context);
    return { triggered: true };
  }

  public async triggerGeofence(geofenceId: string, body: unknown, headers: Record<string, string>): Promise<{ triggered: boolean; error?: string }> {
    const mapping = this.geofenceMap.get(geofenceId);
    if (!mapping) return { triggered: false };

    const signature = headers['x-webhook-signature'] ?? headers['X-Webhook-Signature'];
    if (!signature) return { triggered: false, error: 'Missing X-Webhook-Signature header' };

    const parsed = body as { lat?: number; lon?: number; user?: string; timestamp?: number } | null;
    if (!parsed || typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number' || typeof parsed.user !== 'string' || typeof parsed.timestamp !== 'number') {
      return { triggered: false, error: 'Invalid payload: requires { lat: number, lon: number, user: string, timestamp: number }' };
    }

    const secret = mapping.userSecrets[parsed.user];
    if (!secret) return { triggered: false, error: 'Unknown or untracked user' };

    const payload = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return { triggered: false, error: 'Invalid signature' };
      }
    } catch {
      return { triggered: false, error: 'Invalid signature format' };
    }

    const REPLAY_WINDOW_MS = 5 * 60 * 1000;
    if (Math.abs(Date.now() - parsed.timestamp) > REPLAY_WINDOW_MS) {
      return { triggered: false, error: 'Stale or future timestamp (replay protection)' };
    }

    const user = this.userService.findByName(parsed.user);
    if (!user) return { triggered: false, error: 'Unknown user' };

    const flow = this.automationsService.getById(mapping.flowId);
    if (!flow?.enabled) return { triggered: false };

    const triggerNode = flow.nodes.find((n) => n.id === mapping.nodeId);
    if (!triggerNode) return { triggered: false };

    const trackedUsers = (triggerNode.data.users as string[]) ?? [];
    if (trackedUsers.length > 0 && !trackedUsers.includes(parsed.user)) {
      return { triggered: false };
    }

    const zoneLat = triggerNode.data.latitude as number;
    const zoneLon = triggerNode.data.longitude as number;
    const radius = triggerNode.data.radius as number;
    const eventFilter = (triggerNode.data.event as 'enter' | 'leave' | 'both') ?? 'both';

    const distance = haversineDistance(parsed.lat, parsed.lon, zoneLat, zoneLon);
    const currentState: 'inside' | 'outside' = distance <= radius ? 'inside' : 'outside';

    const stateKey = `${geofenceId}:${parsed.user}`;
    const lastEntry = this.geofenceStates.get(stateKey);

    this.geofenceStates.set(stateKey, { lat: parsed.lat, lon: parsed.lon, state: currentState, updatedAt: Date.now() });

    // First report: no trigger (initialization)
    if (!lastEntry) return { triggered: false };

    if (lastEntry.state === currentState) return { triggered: false };

    const transitionEvent: 'enter' | 'leave' = currentState === 'inside' ? 'enter' : 'leave';

    if (eventFilter !== 'both' && eventFilter !== transitionEvent) return { triggered: false };

    const zoneName = (triggerNode.data.zoneName as string) ?? '';
    const context = createEmptyContext();
    context.geofence = {
      user: parsed.user,
      event: transitionEvent,
      zone: zoneName,
      lat: parsed.lat,
      lon: parsed.lon,
      distance,
    };

    await this.executeFlow(flow, triggerNode, context);
    return { triggered: true };
  }

  private createTriggerContext(): TriggerContext {
    return {
      api: this.api,
      logger: this.logger,
      executeFlow: (flow, triggerNode, context) => this.executeFlow(flow, triggerNode, context),
      addSubscription: (flowId, sub) => this.addSubscription(flowId, sub),
      addSchedule: (flowId, timer) => {
        if (!this.schedules.has(flowId)) this.schedules.set(flowId, []);
        this.schedules.get(flowId)!.push(timer);
      },
    };
  }

  private registerTriggers(flow: DBAutomation): void {
    const triggerNodes = flow.nodes.filter((n) => n.type?.startsWith('trigger-'));
    const ctx = this.createTriggerContext();

    for (const node of triggerNodes) {
      switch (node.type) {
        case 'trigger-detection':
          subscribeDetection(ctx, flow, node);
          break;
        case 'trigger-sensor':
          subscribeSensor(ctx, flow, node);
          break;
        case 'trigger-schedule':
          scheduleTimer(ctx, flow, node);
          break;
        case 'trigger-webhook':
          registerWebhook(this.webhookMap, flow, node);
          break;
        case 'trigger-geofence':
          registerGeofence(this.geofenceMap, flow, node);
          break;
        case 'trigger-system':
          subscribeSystem(ctx, flow, node);
          break;
        case 'trigger-mqtt':
          subscribeMqtt(ctx, flow, node);
          break;
        case 'trigger-manual':
          break;
      }
    }
  }

  private unregisterTriggers(flowId: string): void {
    const subs = this.subscriptions.get(flowId);
    if (subs) {
      for (const sub of subs) sub.dispose();
      this.subscriptions.delete(flowId);
    }

    const timers = this.schedules.get(flowId);
    if (timers) {
      for (const timer of timers) clearInterval(timer);
      this.schedules.delete(flowId);
    }

    for (const [webhookId, mapping] of this.webhookMap) {
      if (mapping.flowId === flowId) this.webhookMap.delete(webhookId);
    }

    for (const [geofenceId, mapping] of this.geofenceMap) {
      if (mapping.flowId === flowId) {
        this.geofenceMap.delete(geofenceId);
        for (const key of this.geofenceStates.keys()) {
          if (key.startsWith(`${geofenceId}:`)) this.geofenceStates.delete(key);
        }
      }
    }

    this.runningFlows.delete(flowId);
    this.lastEventData.delete(flowId);
  }

  private async executeFlow(flow: DBAutomation, triggerNode: DBAutomationNode, context: FlowContext): Promise<void> {
    if (flow.singleExecution && this.runningFlows.has(flow._id)) return;

    if (flow.suppressDuplicates) {
      const eventKey = JSON.stringify({ event: context.event, sensor: context.sensor });
      if (this.lastEventData.get(flow._id) === eventKey) return;
      this.lastEventData.set(flow._id, eventKey);
    }

    this.logger.trace(`Automation "${flow.name}" triggered (${triggerNode.type})`);

    this.runningFlows.add(flow._id);
    await this.updateLastRun(flow._id, 'running');

    try {
      const runner = new FlowRunner(this.api, this.logger);
      await runner.run(flow, triggerNode, context);
      await this.updateLastRun(flow._id, 'success');
      this.logger.trace(`Automation "${flow.name}" completed successfully`);
    } catch (error: any) {
      await this.updateLastRun(flow._id, 'error', error.message);
      this.logger.debug(`Automation "${flow.name}" failed: ${error.message}`);
    } finally {
      this.runningFlows.delete(flow._id);
    }
  }

  private subscribeCameraDeletion(): void {
    const bus = container.resolve<InternalEventBus>('internalBus');
    bus.onEvent('camera:removed', (payload) => {
      const cameraId = (payload as any).cameraId as string;
      if (cameraId) this.markFlowsRequiringUpdate(cameraId);
    });
  }

  private async markFlowsRequiringUpdate(cameraId: string): Promise<void> {
    const affected = await this.automationsService.disableFlowsReferencingCamera(cameraId);

    for (const flow of affected) {
      this.unregisterTriggers(flow._id);
      this.logger.debug(`Automation "${flow.name}" disabled: references deleted camera "${cameraId}"`);
    }
  }

  private addSubscription(flowId: string, sub: Disposable): void {
    if (!this.subscriptions.has(flowId)) this.subscriptions.set(flowId, []);
    this.subscriptions.get(flowId)!.push(sub);
  }

  private async updateLastRun(flowId: string, status: 'success' | 'error' | 'running', error?: string): Promise<void> {
    await this.automationsService.setLastRun(flowId, {
      status,
      timestamp: Date.now(),
      error,
    });
  }
}
