import { sleep } from '@camera.ui/common/utils';

import { RemoteService } from '../../api/services/remote.service.js';
import { CloudflareService } from './cloudflare.js';
import { CustomDomainService } from './customDomain.js';

import type { Logger } from '@camera.ui/common';
import type { DBRemote, DBRemoteDirectMode } from '../../api/database/types.js';
import type { HealthResponse } from '../../api/types/index.js';
import type { ProxyService } from '../tunnel/index.js';
import type { DirectOverrideStatus, RemoteAccessStatus, RemoteTestResult } from '../types.js';
import type { CloudflareManagedService, ManagedTunnelStatus } from './cloudflare-managed.js';

type ActiveMode = 'cloudflare' | 'cloudflareQuick' | 'customDomain' | null;

export class RemoteAccessService {
  private remoteService: RemoteService;
  private cloudflareService: CloudflareService;
  private customDomainService: CustomDomainService;

  private remoteConfig: DBRemote;
  private activeMode: ActiveMode = null;
  private override: DirectOverrideStatus = { active: false, fallback: false };
  private reconcileChain: Promise<void> = Promise.resolve();

  constructor(
    private logger: Logger,
    private proxyService: ProxyService,
  ) {
    this.remoteService = new RemoteService();
    this.cloudflareService = new CloudflareService(this.logger);
    this.customDomainService = new CustomDomainService(this.logger);
    this.remoteConfig = this.remoteService.info();
  }

  public async start(): Promise<void> {
    await this.reconcile();
  }

  public stop(): void {
    this.cloudflareService.stop();
    this.customDomainService.reset();
    this.activeMode = null;
    this.override = { active: false, fallback: false };
  }

  public reconcile(): Promise<void> {
    this.reconcileChain = this.reconcileChain
      .then(() => this.doReconcile())
      .catch((err: any) => {
        this.logger.error('Remote direct reconcile failed:', err?.message ?? err);
      });

    return this.reconcileChain;
  }

  public async update(): Promise<void> {
    const next = this.remoteService.info();
    const prev = this.remoteConfig;

    if (prev.enabled !== next.enabled) {
      await this.updateWithCloud(next.enabled);
    }

    await this.cleanupManagedIfMoving(next);

    const directConfigChanged =
      prev.directEnabled !== next.directEnabled ||
      prev.directMode !== next.directMode ||
      prev.customDomain.url !== next.customDomain.url ||
      prev.cloudflare?.mode !== next.cloudflare?.mode ||
      prev.cloudflare?.hostname !== next.cloudflare?.hostname ||
      prev.cloudflare?.token !== next.cloudflare?.token;

    this.remoteConfig = next;

    if (directConfigChanged) {
      this.teardownActive();
    }
    await this.reconcile();
  }

  public getStatus(): RemoteAccessStatus {
    return {
      enabled: this.remoteConfig.enabled,
      directEnabled: this.remoteConfig.directEnabled,
      directMode: this.remoteConfig.directMode,
      externalUrl: this.activeExternalUrl(),
      override: { ...this.override },
    };
  }

  public async test(mode: DBRemoteDirectMode): Promise<RemoteTestResult> {
    if (mode === 'cloudflare') return this.testCloudflare();
    return this.testCustomDomain();
  }

  public get cloudflareManaged(): CloudflareManagedService {
    return this.cloudflareService.managed;
  }

  public managedStatus(): ManagedTunnelStatus {
    return this.cloudflareService.managed.getStatus();
  }

  public managedConnect(hostname: string): void {
    this.cloudflareService.managed.connect(hostname);
  }

  public async managedCancel(): Promise<void> {
    await this.cloudflareService.managed.cancel();
  }

  public async managedDisconnect(): Promise<void> {
    await this.cloudflareService.managed.disconnect();
  }

  public async managedLogout(): Promise<void> {
    await this.cloudflareService.managed.logout();
  }

  private async doReconcile(): Promise<void> {
    this.remoteConfig = this.remoteService.info();
    const cfg = this.remoteConfig;
    const cloudActive = cfg.enabled && this.remoteService.isCloudConnected();
    const effective = cfg.directEnabled || cloudActive;

    if (!effective) {
      this.teardownActive();
      this.override = { active: false, fallback: false };
      return;
    }

    if (!cloudActive || cfg.directEnabled) {
      this.ensureMode(cfg.directMode);
      this.override = { active: false, fallback: false };
      return;
    }

    await this.ensureWorkingForcedDirect();
  }

  private async ensureWorkingForcedDirect(): Promise<void> {
    const cfg = this.remoteConfig;

    if (cfg.directMode === 'cloudflare' && (cfg.cloudflare?.mode ?? 'quick') === 'quick') {
      this.ensureMode('cloudflare');
      this.override = { active: true, fallback: false };
      return;
    }

    if (this.activeMode === 'cloudflareQuick' && this.cloudflareService.isRunning) {
      this.override = { active: true, fallback: true };
      return;
    }

    this.ensureMode(cfg.directMode);
    const target = this.configuredTargetUrl();
    const reachable = target ? await this.waitReachable(target) : false;
    if (reachable) {
      this.override = { active: true, fallback: false };
      return;
    }

    this.logger.warn(`Cloud-forced direct: configured '${cfg.directMode}' target ${target ?? '(none)'} not reachable — falling back to a Cloudflare Quick Tunnel.`);
    this.teardownActive();
    await this.cloudflareService.startQuick();
    this.activeMode = 'cloudflareQuick';
    this.override = { active: true, fallback: true };
  }

  private ensureMode(mode: DBRemoteDirectMode): void {
    if (this.activeMode === mode && this.isActiveRunning()) {
      return;
    }
    this.teardownActive();
    this.activateMode(mode);
    this.activeMode = mode;
  }

  private async cleanupManagedIfMoving(next: DBRemote): Promise<void> {
    const wasManaged = this.remoteConfig.cloudflare?.mode === 'managed' && this.remoteConfig.directEnabled && this.remoteConfig.directMode === 'cloudflare';
    if (!wasManaged) return;

    const stillManaged = next.cloudflare?.mode === 'managed' && next.directEnabled && next.directMode === 'cloudflare';
    const hostnameChanged = this.remoteConfig.cloudflare?.hostname !== next.cloudflare?.hostname;

    if (stillManaged && !hostnameChanged) return;

    try {
      await this.cloudflareService.managed.disconnect();
    } catch (err: any) {
      this.logger.error('Managed tunnel cleanup failed:', err?.message ?? err);
    }
  }

  private async testCloudflare(): Promise<RemoteTestResult> {
    const url = this.cloudflareService.url;
    if (!url) {
      return {
        ok: false,
        message: 'Cloudflare tunnel is not running',
        testedAt: Date.now(),
      };
    }
    return this.probeUrl(url);
  }

  private async testCustomDomain(): Promise<RemoteTestResult> {
    const url = this.remoteConfig.customDomain.url;
    if (!url) {
      return {
        ok: false,
        message: 'No custom domain configured',
        testedAt: Date.now(),
      };
    }
    return this.probeUrl(url);
  }

  private async waitReachable(url: string, timeoutMs = 12_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((await this.probeUrl(url)).ok) {
        return true;
      }
      if (Date.now() + 2_000 >= deadline) {
        return false;
      }
      await sleep(2_000);
    }
  }

  private async probeUrl(url: string): Promise<RemoteTestResult> {
    const base = url.replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return {
          ok: false,
          message: `Reachable but unhealthy (${response.status})`,
          testedAt: Date.now(),
          details: { url: base, status: response.status },
        };
      }

      const health = (await response.json()) as HealthResponse;
      const ok = health.status === 'ok';
      return {
        ok,
        message: ok ? 'Reachable' : `Health check failed (${health.status})`,
        testedAt: Date.now(),
        details: { url: base, health },
      };
    } catch (error: any) {
      return {
        ok: false,
        message: error.message ?? 'Unknown error',
        testedAt: Date.now(),
        details: { url: base },
      };
    }
  }

  private configuredTargetUrl(): string | null {
    const cfg = this.remoteConfig;
    if (cfg.directMode === 'customDomain') {
      const url = cfg.customDomain.url?.trim() ?? '';
      return url.length > 0 ? url : null;
    }
    return cfg.cloudflare?.hostname ? `https://${cfg.cloudflare.hostname}` : null;
  }

  private activeExternalUrl(): string | null {
    if (this.activeMode === 'cloudflare' || this.activeMode === 'cloudflareQuick') {
      return this.cloudflareService.url;
    }
    if (this.activeMode === 'customDomain') {
      return this.customDomainService.url;
    }
    return null;
  }

  private isActiveRunning(): boolean {
    if (this.activeMode === 'cloudflare' || this.activeMode === 'cloudflareQuick') {
      return this.cloudflareService.isRunning;
    }
    if (this.activeMode === 'customDomain') {
      return this.customDomainService.url !== null;
    }
    return false;
  }

  private activateMode(mode: DBRemoteDirectMode): void {
    if (mode === 'cloudflare') {
      this.cloudflareService.start();
    } else if (mode === 'customDomain') {
      const url = this.remoteConfig.customDomain.url;
      if (url) {
        this.customDomainService.testDomain(url);
      } else {
        this.customDomainService.reset();
      }
    }
  }

  private teardownActive(): void {
    if (this.activeMode === 'cloudflare' || this.activeMode === 'cloudflareQuick') {
      this.cloudflareService.stop();
    } else if (this.activeMode === 'customDomain') {
      this.customDomainService.reset();
    }
    this.activeMode = null;
  }

  private async updateWithCloud(enabled: boolean): Promise<void> {
    try {
      this.logger.log(`Updating cloud server: disabled=${!enabled}`);
      await this.remoteService.updateCloudServer(enabled);
    } catch (error) {
      this.logger.error('Failed to update cloud status:', error.message);
    }

    if (!enabled) {
      await this.proxyService.disconnect();
    }
  }
}
