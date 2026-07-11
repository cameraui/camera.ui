import { PromiseTimeout } from '@camera.ui/common/utils';
import { Aedes } from 'aedes';
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:net';
import { container } from 'tsyringe';

import type { AuthenticateError } from 'aedes';
import type { Server, Socket } from 'node:net';
import type { LoggerService } from '../services/logger/index.js';

export interface MqttBrokerOptions {
  port: number;
  username: string | null;
  password: string | null;
}

export class MqttBroker {
  private aedes?: Aedes;
  private server?: Server;
  private logger: LoggerService;

  private readonly connections = new Set<Socket>();

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
  }

  public get running(): boolean {
    return this.server?.listening ?? false;
  }

  public async start(options: MqttBrokerOptions): Promise<void> {
    if (this.server) return;

    const aedes = await Aedes.createBroker({
      authenticate: (_client, username, password, done) => {
        if (!options.username || !options.password) {
          done(null, true);
          return;
        }

        if (username === options.username && !!password && safeEqual(password.toString('utf8'), options.password)) {
          done(null, true);
          return;
        }

        const error = new Error('Bad username or password') as AuthenticateError;
        error.returnCode = 4;
        done(error, false);
      },
    });
    this.aedes = aedes;

    aedes.on('clientError', (client, error) => {
      this.logger.debug(`MQTT broker client error (${client?.id ?? 'unknown'}): ${error.message}`);
    });
    aedes.on('connectionError', (client, error) => {
      this.logger.debug(`MQTT broker connection error (${client?.id ?? 'unknown'}): ${error.message}`);
    });

    const server = createServer(aedes.handle);
    server.on('connection', (socket) => {
      this.connections.add(socket);
      socket.once('close', () => this.connections.delete(socket));
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      await this.cleanup(aedes, server);
      throw error;
    }

    this.server = server;
    server.on('error', (error) => {
      this.logger.warn(`MQTT broker server error: ${error.message}`);
    });

    this.logger.log(`Built-in MQTT broker listening on port ${options.port}`);
  }

  public async stop(): Promise<void> {
    const { aedes, server } = this;
    this.aedes = undefined;
    this.server = undefined;

    if (aedes ?? server) {
      await this.cleanup(aedes, server);
      this.logger.log('Built-in MQTT broker stopped');
    }
  }

  private async cleanup(aedes?: Aedes, server?: Server): Promise<void> {
    if (server) {
      for (const socket of this.connections) {
        socket.destroy();
      }
      this.connections.clear();
      await PromiseTimeout(new Promise<void>((resolve) => server.close(() => resolve())), 2000).catch(() => {});
    }
    if (aedes) {
      await PromiseTimeout(new Promise<void>((resolve) => aedes.close(() => resolve())), 2000).catch(() => {});
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
