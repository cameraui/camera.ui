import { install } from 'cloudflared';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { container } from 'tsyringe';

import { RemoteService } from '../../api/services/remote.service.js';

import type { Logger } from '@camera.ui/common';
import type { ChildProcess } from 'node:child_process';
import type { ConfigService } from '../../services/config/index.js';

export type ManagedTunnelState = 'idle' | 'awaiting_login' | 'creating_tunnel' | 'setting_dns' | 'running';

export interface ManagedTunnelStatus {
  state: ManagedTunnelState;
  hostname: string | null;
  tunnelId: string | null;
  loginUrl: string | null;
  lastError: string | null;
  hasCert: boolean;
}

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const STEP_TIMEOUT_MS = 30 * 1000;

export class CloudflareManagedService {
  private remoteService: RemoteService;
  private configService: ConfigService;

  private cloudflarePath: string;

  private _state: ManagedTunnelState = 'idle';
  private _loginUrl: string | null = null;
  private _lastError: string | null = null;

  private runProcess?: ChildProcess;
  private stepProcess?: ChildProcess;

  constructor(private logger: Logger) {
    this.configService = container.resolve<ConfigService>('configService');
    this.remoteService = new RemoteService();

    this.cloudflarePath = join(this.configService.STORAGE_PATH, '.cloudflare');
    mkdirSync(this.cloudflarePath, { recursive: true });
  }

  public getStatus(): ManagedTunnelStatus {
    const cf = this.remoteService.info().cloudflare;
    return {
      state: this._state,
      hostname: cf?.hostname ?? null,
      tunnelId: cf?.tunnelId ?? null,
      loginUrl: this._loginUrl,
      lastError: this._lastError,
      hasCert: existsSync(this.certPath()),
    };
  }

  public async resumeIfReady(): Promise<boolean> {
    const cf = this.remoteService.info().cloudflare;
    if (cf?.mode !== 'managed' || !cf.hostname || !cf.tunnelId) return false;
    if (!existsSync(this.certPath()) || !existsSync(this.credentialsPath(cf.tunnelId))) {
      this._lastError = 'Stored tunnel credentials are missing on disk. Please reconnect.';
      this._state = 'idle';
      return false;
    }
    await this.spawnRun(cf.tunnelId, cf.hostname);
    return true;
  }

  public async connect(hostname: string): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error(`Cloudflare connect already in progress (state=${this._state}).`);
    }
    this._lastError = null;

    await this.ensureCloudflaredInstalled();

    if (!existsSync(this.certPath())) {
      try {
        await this.runLogin();
      } catch (err: any) {
        this.fail(`Login failed: ${err.message ?? err}`);
        return;
      }
    }

    let tunnelId = this.remoteService.info().cloudflare?.tunnelId ?? null;
    if (!tunnelId || !existsSync(this.credentialsPath(tunnelId))) {
      try {
        tunnelId = await this.createTunnel(hostname);
        await this.remoteService.patch({ cloudflare: { tunnelId } });
      } catch (err: any) {
        this.fail(`Tunnel create failed: ${err.message ?? err}`);
        return;
      }
    }

    try {
      await this.routeDns(tunnelId, hostname);
    } catch (err: any) {
      this.fail(`DNS route failed: ${err.message ?? err}`);
      return;
    }

    try {
      await this.spawnRun(tunnelId, hostname);
    } catch (err: any) {
      this.fail(`Tunnel run failed: ${err.message ?? err}`);
    }
  }

  public async cancel(): Promise<void> {
    this.stepProcess?.kill('SIGKILL');
    this.stepProcess = undefined;
    this.runProcess?.kill('SIGKILL');
    this.runProcess = undefined;
    this._state = 'idle';
    this._loginUrl = null;
  }

  public async disconnect(): Promise<void> {
    await this.cancel();
    const tunnelId = this.remoteService.info().cloudflare?.tunnelId;
    if (tunnelId) {
      await this.runOnce(['tunnel', 'cleanup', tunnelId]).catch(() => {});
      await this.runOnce(['tunnel', 'delete', tunnelId]).catch(() => {});
      await rm(this.credentialsPath(tunnelId), { force: true }).catch(() => {});
      await rm(this.configPath(tunnelId), { force: true }).catch(() => {});
      await this.remoteService.patch({ cloudflare: { tunnelId: null } });
    }
  }

  public async logout(): Promise<void> {
    await this.disconnect();
    await rm(this.certPath(), { force: true }).catch(() => {});
  }

  public stop(): void {
    this.runProcess?.kill('SIGKILL');
    this.runProcess = undefined;
    this.stepProcess?.kill('SIGKILL');
    this.stepProcess = undefined;
    this._state = 'idle';
    this._loginUrl = null;
  }

  public get runningUrl(): string | null {
    if (this._state !== 'running') return null;
    const hostname = this.remoteService.info().cloudflare?.hostname;
    return hostname ? `https://${hostname}` : null;
  }

  private fail(message: string): void {
    this.logger.error('Cloudflare (managed):', message);
    this._lastError = message;
    this._state = 'idle';
    this._loginUrl = null;
  }

  private async runLogin(): Promise<void> {
    this._state = 'awaiting_login';
    this._loginUrl = null;

    const output = await this.runStep(['tunnel', 'login'], LOGIN_TIMEOUT_MS, (line) => {
      const match = /(https:\/\/[^\s)]*(?:cloudflareaccess\.com|dash\.cloudflare\.com)[^\s)]*)/.exec(line);
      if (match && !this._loginUrl) {
        this._loginUrl = match[1];
        this.logger.log('Cloudflare login URL:', this._loginUrl);
      }
    });

    if (!existsSync(this.certPath())) {
      const defaultCert = join(homedir(), '.cloudflared', 'cert.pem');
      if (existsSync(defaultCert)) {
        await rename(defaultCert, this.certPath()).catch(async (err) => {
          if (err?.code === 'EXDEV') {
            const data = await readFile(defaultCert);
            await writeFile(this.certPath(), data, { mode: 0o600 });
            await rm(defaultCert, { force: true });
          } else {
            throw err;
          }
        });
      }
    }

    if (!existsSync(this.certPath())) {
      throw new Error(`login completed but cert.pem not written.${output ? ' Output: ' + output.slice(-300) : ''}`);
    }
    this._loginUrl = null;
    this.logger.log('Cloudflare login completed.');
  }

  private async createTunnel(hostname: string): Promise<string> {
    this._state = 'creating_tunnel';
    const name = `camera.ui-${hostname.replace(/[^a-z0-9-]/gi, '-')}`;

    // Wipe any prior tunnel with the same name — `create` errors out otherwise.
    await this.runOnce(['tunnel', 'cleanup', name]).catch(() => {});
    await this.runOnce(['tunnel', 'delete', name]).catch(() => {});

    const output = await this.runStep(['tunnel', 'create', name], STEP_TIMEOUT_MS);
    const credentialsMatch = /Tunnel credentials written to (.+?\.json)/.exec(output);
    if (!credentialsMatch) {
      throw new Error('credentials path not found in cloudflared output');
    }
    const generatedPath = credentialsMatch[1].trim();
    const raw = await readFile(generatedPath, 'utf8');
    const json = JSON.parse(raw);
    const tunnelId: string = json.TunnelID;
    if (!tunnelId) throw new Error('TunnelID missing in credentials json');

    // Move credentials into our managed dir if cloudflared wrote them elsewhere
    // (default is $HOME/.cloudflared/<id>.json).
    const target = this.credentialsPath(tunnelId);
    if (generatedPath !== target) {
      await writeFile(target, raw, { mode: 0o600 });
      await rm(generatedPath, { force: true }).catch(() => {});
    }
    return tunnelId;
  }

  private async routeDns(tunnelId: string, hostname: string): Promise<void> {
    this._state = 'setting_dns';
    await this.runStep(['tunnel', 'route', 'dns', '-f', tunnelId, hostname], STEP_TIMEOUT_MS);
  }

  private async spawnRun(tunnelId: string, hostname: string): Promise<void> {
    const yaml = [
      `url: https://127.0.0.1:${this.configService.config.port}`,
      `tunnel: ${tunnelId}`,
      `credentials-file: ${this.credentialsPath(tunnelId)}`,
      'no-tls-verify: true',
      `http-host-header: ${hostname}`,
      'connect-timeout: 10s',
      `origincert: ${this.certPath()}`,
      '',
    ].join('\n');
    await writeFile(this.configPath(tunnelId), yaml, { mode: 0o600 });

    const args = ['tunnel', '--no-autoupdate', '--config', this.configPath(tunnelId), 'run', tunnelId];
    const env = { ...process.env, TUNNEL_ORIGIN_CERT: this.certPath() };
    this.runProcess = spawn(this.cloudflaredBinaryPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });

    const pid = this.runProcess.pid;
    if (pid) {
      this.configService.addProcess({ pid, startTime: Date.now(), command: this.cloudflaredBinaryPath(), args });
    }

    this.runProcess.on('exit', (code) => {
      if (pid) this.configService.removeProcessByPID(pid);
      if (this._state === 'running') {
        this.fail(`tunnel run exited unexpectedly (code=${code})`);
      }
    });

    const stdout = createInterface({ input: this.runProcess.stdout!, terminal: false });
    const stderr = createInterface({ input: this.runProcess.stderr!, terminal: false });
    stdout.on('line', (l) => this.logger.trace(l));
    stderr.on('line', (l) => this.logger.trace(l));

    this._state = 'running';
  }

  private async runStep(args: string[], timeoutMs: number, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, TUNNEL_ORIGIN_CERT: this.certPath() };
      const proc = spawn(this.cloudflaredBinaryPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });
      this.stepProcess = proc;

      let output = '';
      const handleData = (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        if (onLine) {
          for (const line of text.split(/\r?\n/)) {
            if (line) onLine(line);
          }
        }
      };
      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`cloudflared ${args[0]} ${args[1]} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('exit', (code) => {
        clearTimeout(timer);
        if (this.stepProcess === proc) this.stepProcess = undefined;
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`cloudflared exited with code ${code}: ${output.slice(-500)}`));
        }
      });
    });
  }

  private async runOnce(args: string[]): Promise<string> {
    return this.runStep(args, STEP_TIMEOUT_MS);
  }

  private async ensureCloudflaredInstalled(): Promise<void> {
    if (existsSync(this.cloudflaredBinaryPath())) return;
    await install(this.cloudflaredBinaryPath());
  }

  private cloudflaredBinaryPath(): string {
    return join(this.cloudflarePath, 'cloudflared');
  }

  private certPath(): string {
    return join(this.cloudflarePath, 'cert.pem');
  }

  private credentialsPath(tunnelId: string): string {
    return join(this.cloudflarePath, `${tunnelId}.json`);
  }

  private configPath(tunnelId: string): string {
    return join(this.cloudflarePath, `${tunnelId}.yml`);
  }
}
