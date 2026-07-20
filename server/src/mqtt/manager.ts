import { PromiseTimeout } from '@camera.ui/common/utils';
import mqtt from 'mqtt';
import { container } from 'tsyringe';

import { MqttBridge } from './bridge.js';
import { MqttBroker } from './broker.js';
import { MqttTopics, topicMatchesFilter } from './topics.js';

import type { IClientOptions, MqttClient } from 'mqtt';
import type { Database } from '../api/database/index.js';
import type { DBMqtt } from '../api/database/types.js';
import type { SocketService } from '../api/websocket/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { MqttStatus, MqttTestResult } from './types.js';

const MAX_RECENT_TOPICS = 200;

export class MqttManager {
  public topics: MqttTopics;

  private client?: MqttClient;
  private bridge: MqttBridge;
  private broker: MqttBroker;
  private status: MqttStatus = { state: 'disabled', connectedAt: null, lastError: null };
  private stopping = false;
  private activeSettings?: DBMqtt;
  private triggerSubscriptions = new Map<symbol, { filter: string; handler: (topic: string, payload: string) => void }>();
  private recentTopics = new Map<string, number>();

  private logger: LoggerService;
  private dbs: Database;

  constructor() {
    container.registerInstance('mqttManager', this);

    this.logger = container.resolve<LoggerService>('logger');
    this.dbs = container.resolve<Database>('dbs');

    this.topics = new MqttTopics('cameraui');
    this.bridge = new MqttBridge(this);
    this.broker = new MqttBroker();
  }

  public get connected(): boolean {
    return this.client?.connected ?? false;
  }

  public get haDiscovery(): { enabled: boolean; prefix: string } {
    return this.activeSettings?.haDiscovery ?? { enabled: false, prefix: 'homeassistant' };
  }

  public get brokerRunning(): boolean {
    return this.broker.running;
  }

  public async start(): Promise<void> {
    const settings = this.settings();
    this.activeSettings = settings;
    this.topics = new MqttTopics(settings.topicPrefix || 'cameraui');

    if (!settings.enabled || (settings.mode === 'external' && !settings.host)) {
      this.setStatus({ state: 'disabled', connectedAt: null, lastError: null });
      return;
    }

    if (settings.mode === 'embedded') {
      try {
        await this.broker.start({
          port: settings.broker.port,
          username: settings.broker.username,
          password: settings.broker.password,
        });
      } catch (error: any) {
        this.logger.warn(`Failed to start built-in MQTT broker: ${error.message}`);
        this.setStatus({ state: 'error', connectedAt: null, lastError: error.message });
        return;
      }
    }

    this.stopping = false;
    this.bridge.attach();
    this.connect(settings);
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    this.bridge.detach();

    const client = this.client;
    this.client = undefined;

    const wasActive = !!client || this.broker.running;
    if (wasActive) {
      this.logger.log('Stopping MQTT');
    }

    if (client) {
      if (client.connected) {
        await PromiseTimeout(
          new Promise<void>((resolve) => {
            client.publish(this.topics.availability, 'offline', { retain: true, qos: 1 }, () => resolve());
          }),
          1000,
        ).catch(() => {});
      }
      await PromiseTimeout(client.endAsync(), 2000).catch(() => {});
    }

    await this.broker.stop().catch(() => {});

    this.setStatus({ state: 'disabled', connectedAt: null, lastError: null });
    if (wasActive) {
      this.logger.log('MQTT stopped');
    }
  }

  public async applySettings(): Promise<void> {
    const next = this.settings();
    const prev = this.activeSettings;

    if (prev && this.connected && prev.haDiscovery.enabled) {
      const haUnchanged = next.enabled && next.haDiscovery.enabled && next.haDiscovery.prefix === prev.haDiscovery.prefix && next.topicPrefix === prev.topicPrefix;
      if (!haUnchanged) {
        this.bridge.clearDiscovery(prev.haDiscovery.prefix);
      }
    }

    await this.stop();
    await this.start();
  }

  public getStatus(): MqttStatus {
    return {
      ...this.status,
      broker: this.broker.running ? { running: true, port: this.activeSettings?.broker.port ?? 1883 } : null,
    };
  }

  public getRecentTopics(): string[] {
    return Array.from(this.recentTopics.keys()).reverse();
  }

  public publish(topic: string, payload: string | Buffer, opts: { retain?: boolean; qos?: 0 | 1 } = {}): void {
    const client = this.client;
    if (!client?.connected) return;

    client.publish(topic, payload, { retain: opts.retain ?? false, qos: opts.qos ?? 0 }, (error) => {
      if (error) {
        this.logger.debug(`MQTT publish to "${topic}" failed: ${error.message}`);
      }
    });
  }

  public subscribeTrigger(filter: string, handler: (topic: string, payload: string) => void): () => void {
    const key = Symbol(filter);
    this.triggerSubscriptions.set(key, { filter, handler });

    if (this.client?.connected) {
      this.client.subscribe(filter, { qos: 0 }, () => {});
    }

    return () => {
      this.triggerSubscriptions.delete(key);
      const stillUsed = Array.from(this.triggerSubscriptions.values()).some((sub) => sub.filter === filter);
      if (!stillUsed && this.client?.connected) {
        this.client.unsubscribe(filter, () => {});
      }
    };
  }

  public async test(settings: DBMqtt): Promise<MqttTestResult> {
    if (settings.mode === 'embedded' && !this.broker.running) {
      return { ok: false, message: 'Built-in broker is not running — save the settings first' };
    }
    if (settings.mode === 'external' && !settings.host) {
      return { ok: false, message: 'Host is required' };
    }

    return new Promise<MqttTestResult>((resolve) => {
      const client = mqtt.connect(buildBrokerUrl(settings), {
        ...buildClientOptions(settings),
        clientId: `${settings.clientId || 'cameraui'}-test-${Date.now().toString(36)}`,
        reconnectPeriod: 0,
        connectTimeout: 8000,
        will: undefined,
      });

      const finish = (result: MqttTestResult, force: boolean) => {
        clearTimeout(timer);
        client.end(force, () => {});
        resolve(result);
      };

      const timer = setTimeout(() => finish({ ok: false, message: 'Connection timeout' }, true), 10000);

      client.once('connect', () => finish({ ok: true }, false));
      client.once('error', (error) => finish({ ok: false, message: error.message }, true));
    });
  }

  private settings(): DBMqtt {
    return this.dbs.mqttDB.get('mqtt')!;
  }

  private connect(settings: DBMqtt): void {
    this.setStatus({ state: 'connecting', connectedAt: null, lastError: null });

    const client = mqtt.connect(buildBrokerUrl(settings), {
      ...buildClientOptions(settings),
      will: {
        topic: this.topics.availability,
        payload: Buffer.from('offline'),
        retain: true,
        qos: 1,
      },
    });
    this.client = client;

    client.on('connect', () => {
      this.logger.log(`MQTT connected to ${buildBrokerUrl(settings)}`);
      this.setStatus({ state: 'connected', connectedAt: Date.now(), lastError: null });

      this.publish(this.topics.availability, 'online', { retain: true, qos: 1 });

      client.subscribe(`${this.topics.prefix}/camera/+/sensor/+/+/set`, { qos: 0 }, (error) => {
        if (error) {
          this.logger.debug(`MQTT command subscription failed: ${error.message}`);
        }
      });

      for (const filter of new Set(Array.from(this.triggerSubscriptions.values(), (sub) => sub.filter))) {
        client.subscribe(filter, { qos: 0 }, () => {});
      }

      this.bridge.publishFullState();
    });

    client.on('message', (topic, payload) => {
      this.trackTopic(topic);
      this.bridge.handleCommand(topic, payload);

      if (this.triggerSubscriptions.size === 0) return;
      const payloadText = payload.toString('utf8');
      for (const { filter, handler } of this.triggerSubscriptions.values()) {
        if (topicMatchesFilter(filter, topic)) {
          try {
            handler(topic, payloadText);
          } catch (error: any) {
            this.logger.debug(`MQTT trigger handler failed for "${topic}": ${error.message}`);
          }
        }
      }
    });

    client.on('reconnect', () => {
      if (this.stopping) return;
      this.setStatus({ ...this.status, state: 'reconnecting' });
    });

    client.on('close', () => {
      if (this.stopping || this.status.state === 'error') return;
      if (this.status.state === 'connected') {
        this.setStatus({ ...this.status, state: 'reconnecting', connectedAt: null });
      }
    });

    client.on('error', (error) => {
      this.logger.debug(`MQTT error: ${error.message}`);
      this.setStatus({ ...this.status, state: 'error', lastError: error.message });
    });
  }

  private trackTopic(topic: string): void {
    this.recentTopics.delete(topic);
    this.recentTopics.set(topic, Date.now());
    if (this.recentTopics.size > MAX_RECENT_TOPICS) {
      const oldest = this.recentTopics.keys().next().value;
      if (oldest !== undefined) this.recentTopics.delete(oldest);
    }
  }

  private setStatus(status: MqttStatus): void {
    const changed = this.status.state !== status.state || this.status.lastError !== status.lastError;
    this.status = status;
    if (!changed) return;

    try {
      const socketService = container.resolve<SocketService>('socketService');
      socketService.io.of('/server').emit('mqtt-status', this.getStatus());
    } catch {
      // socket service not up yet (early boot) — UI fetches status on connect
    }
  }
}

function buildBrokerUrl(settings: DBMqtt): string {
  if (settings.mode === 'embedded') {
    return `mqtt://127.0.0.1:${settings.broker.port}`;
  }
  return `${settings.protocol}://${settings.host}:${settings.port}`;
}

function buildClientOptions(settings: DBMqtt): IClientOptions {
  const base: IClientOptions = {
    clientId: settings.clientId || 'cameraui',
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  };

  if (settings.mode === 'embedded') {
    return {
      ...base,
      username: settings.broker.username ?? undefined,
      password: settings.broker.password ?? undefined,
    };
  }

  return {
    ...base,
    username: settings.username ?? undefined,
    password: settings.password ?? undefined,
    rejectUnauthorized: settings.tls.rejectUnauthorized,
    ca: settings.tls.ca ?? undefined,
    cert: settings.tls.cert ?? undefined,
    key: settings.tls.key ?? undefined,
  };
}
