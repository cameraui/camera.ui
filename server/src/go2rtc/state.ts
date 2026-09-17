import { API_EVENT } from '@camera.ui/sdk';
import { EventEmitter } from 'node:events';
import { container } from 'tsyringe';
import { WebSocket } from 'ws';

import type { Logger } from '@camera.ui/common/logger';
import type { RawData } from 'ws';
import type { CameraUiAPI } from '../api.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { Go2RTCOffers, Go2RTCProducer, Go2RTCReceiver, Go2RTCSender, StreamStatus, StreamStatusResponse } from './types.js';

export interface Go2RtcConsumerState {
  id?: number;
  format_name?: string;
  protocol?: string;
  remote_addr?: string;
  user_agent?: string;
  tag?: string;
}

export interface Go2RtcStreamState {
  status: StreamStatus;
  error?: string;
  producers: Go2RTCProducer[];
  consumers: Go2RtcConsumerState[];
  preload: { attached: boolean; error?: string } | null;
  offers: Go2RTCOffers;
}

export interface Go2RtcStreamStats {
  producers: { id?: number; receivers: Go2RTCReceiver[] | null }[];
  consumers: { id?: number; senders: Go2RTCSender[] | null }[];
}

interface Go2RtcStateEvents {
  stream: [name: string, state: Go2RtcStreamState | undefined];
  snapshot: [];
  stats: [stats: Record<string, Go2RtcStreamStats>];
}

type Go2RtcMessage =
  | { type: 'cui/snapshot'; value: { streams: Record<string, Go2RtcStreamState> } }
  | { type: 'cui/stream'; value: { name: string; state: Go2RtcStreamState | null } }
  | { type: 'cui/stats'; value: { streams: Record<string, Go2RtcStreamStats> } };

const CONNECT_TIMEOUT_MS = 5_000;
const PING_INTERVAL_MS = 15_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

export class Go2RtcState extends EventEmitter<Go2RtcStateEvents> {
  private logger: Logger;
  private configService: ConfigService;

  private streams = new Map<string, Go2RtcStreamState>();
  private knownOffers = new Map<string, Go2RTCOffers>();
  private ws?: WebSocket;
  private active = false;
  private synced = false;
  private retry = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private snapshotWaiters: (() => void)[] = [];

  constructor() {
    super();
    this.setMaxListeners(0);

    container.registerInstance('go2rtcState', this);

    this.configService = container.resolve<ConfigService>('configService');
    this.logger = container.resolve<LoggerService>('logger').createSystemLogger('Go2RTC', 'go2rtc');

    const api = container.resolve<CameraUiAPI>('api');
    api.setMaxListeners(api.getMaxListeners() + 1);
    api.once(API_EVENT.SHUTDOWN, () => this.disconnect());
  }

  public get connected(): boolean {
    return this.synced;
  }

  public async connect(): Promise<void> {
    this.active = true;
    if (!this.ws) {
      this.open();
    }

    if (this.synced) return;

    let timeout: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve) => {
      this.snapshotWaiters.push(resolve);
      timeout = setTimeout(resolve, CONNECT_TIMEOUT_MS);
    });
    clearTimeout(timeout);

    if (!this.synced) {
      this.logger.warn('No stream state from go2rtc yet, keeps trying in background');
    }
  }

  public disconnect(): void {
    this.active = false;
    clearTimeout(this.reconnectTimer);
    this.close();
  }

  public get(name: string): Go2RtcStreamState | undefined {
    return this.streams.get(name);
  }

  public offers(name: string): Go2RTCOffers | undefined {
    const offers = this.streams.get(name)?.offers;
    if (offers && offers.state !== 'unknown') return offers;
    return this.knownOffers.get(name);
  }

  public rememberOffers(name: string, offers: Go2RTCOffers | undefined): void {
    if (!offers || offers.state === 'unknown') return;
    this.knownOffers.set(name, { ...offers, state: 'cached' });
  }

  public forgetOffers(name: string): void {
    this.knownOffers.delete(name);
  }

  public statuses(): StreamStatusResponse {
    const result: StreamStatusResponse = {};
    for (const [name, state] of this.streams) {
      result[name] = state.status;
    }
    return result;
  }

  public countConsumersByTag(tag: string): number {
    let count = 0;
    for (const state of this.streams.values()) {
      count += state.consumers.filter((consumer) => consumer.tag === tag).length;
    }
    return count;
  }

  private open(): void {
    const ws = new WebSocket(`${this.configService.go2rtcAddress('ws')}/api/ws`, {
      perMessageDeflate: false,
      cert: this.configService.ssl.cert,
      key: this.configService.ssl.key,
      ca: this.configService.ssl.ca,
      rejectUnauthorized: false,
    });
    this.ws = ws;

    ws.on('open', () => {
      this.retry = 0;
      ws.send(JSON.stringify({ type: 'cui/subscribe' }));
      this.startPing(ws);
    });

    ws.on('message', (data) => this.handleMessage(data));

    ws.on('error', (error) => {
      this.logger.debug(`Stream state connection: ${error.message}`);
    });

    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      clearInterval(this.pingTimer);
      this.reset();
      this.scheduleReconnect();
    });
  }

  private close(): void {
    const ws = this.ws;
    this.ws = undefined;
    clearInterval(this.pingTimer);
    ws?.terminate();
    this.reset();
  }

  private startPing(ws: WebSocket): void {
    let alive = true;
    ws.on('pong', () => {
      alive = true;
    });

    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!alive) {
        this.logger.debug('Stream state connection timed out');
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (!this.active) return;

    const delay = RECONNECT_DELAYS_MS[Math.min(this.retry, RECONNECT_DELAYS_MS.length - 1)];
    this.retry++;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.active && !this.ws) this.open();
    }, delay);
  }

  private reset(): void {
    if (!this.synced && !this.streams.size) return;
    this.synced = false;
    this.streams.clear();
    this.emit('snapshot');
  }

  private handleMessage(data: RawData): void {
    let message: Go2RtcMessage;
    try {
      const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
      message = JSON.parse(buffer.toString('utf-8'));
    } catch {
      return;
    }

    switch (message.type) {
      case 'cui/snapshot': {
        this.streams = new Map(Object.entries(message.value.streams ?? {}));
        for (const [name, state] of this.streams) {
          this.rememberOffers(name, state.offers);
        }
        this.synced = true;
        this.emit('snapshot');
        for (const resolve of this.snapshotWaiters.splice(0)) resolve();
        break;
      }
      case 'cui/stream': {
        const { name, state } = message.value;
        if (state) {
          this.streams.set(name, state);
          this.rememberOffers(name, state.offers);
        } else {
          this.streams.delete(name);
        }
        this.emit('stream', name, state ?? undefined);
        break;
      }
      case 'cui/stats': {
        this.emit('stats', message.value.streams ?? {});
        break;
      }
    }
  }
}
