import { WebSocket } from 'ws';

import { inject } from '../../container.js';

import type { RawData } from 'ws';
import type { TurnRelay } from '../../remote/turnRelay.js';
import type { LoggerService } from '../../services/logger/index.js';

export interface Go2rtcMessage {
  type: string;
  value?: unknown;
}

export class Go2rtcSender {
  private tail?: Promise<void>;

  constructor(
    private upstream: WebSocket,
    private turnRelay: TurnRelay | undefined,
    private logger: LoggerService,
  ) {}

  public send(message: Go2rtcMessage): void {
    if (this.turnRelay && message.type === 'webrtc/offer') this.offer(message);
    else this.inOrder(JSON.stringify(message), false);
  }

  public forward(data: RawData, binary: boolean): void {
    const offer = this.turnRelay && !binary ? parseOffer(data) : undefined;
    if (offer) this.offer(offer);
    else this.inOrder(data, binary);
  }

  private offer(message: Go2rtcMessage): void {
    this.chain((this.tail ?? Promise.resolve()).then(async () => this.write(await this.withRelay(message), false)));
  }

  private async withRelay(message: Go2rtcMessage): Promise<string> {
    const relay = await this.turnRelay?.sessionServer();
    if (!relay) {
      this.logger.debug(`Relay not offered to a remote WebRTC session (${this.turnRelay?.status()})`);
      return JSON.stringify(message);
    }
    this.logger.debug('Relay offered to a remote WebRTC session');
    return JSON.stringify({ ...message, ice_servers: [...inject('configService').iceServers, relay] });
  }

  private inOrder(data: RawData | string, binary: boolean): void {
    if (this.tail) this.chain(this.tail.then(() => this.write(data, binary)));
    else this.write(data, binary);
  }

  private chain(run: Promise<void>): void {
    const tail = run.catch((error) => this.logger.warn('Proxy could not forward a go2rtc message:', error?.message ?? error));
    this.tail = tail;
    tail.then(() => {
      if (this.tail === tail) this.tail = undefined;
    });
  }

  private write(data: RawData | string, binary: boolean): void {
    if (this.upstream.readyState === WebSocket.OPEN) this.upstream.send(data, { binary });
  }
}

function parseOffer(data: RawData): Go2rtcMessage | undefined {
  const text = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
  try {
    const message = JSON.parse(text.toString('utf-8')) as Go2rtcMessage | null;
    return message?.type === 'webrtc/offer' ? message : undefined;
  } catch {
    return undefined;
  }
}
