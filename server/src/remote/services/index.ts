import { sleep } from '@camera.ui/common/utils';

import { RemoteService } from '../../api/services/remote.service.js';
import { CloudflareService } from './cloudflare.js';
import { CustomDomainService } from './customDomain.js';
import { publicDnsAnswer, UrlReadinessGate } from './urlReadiness.js';

import type { Logger } from '@camera.ui/common';
import type { DBRemote, DBRemoteDirectMode } from '../../api/database/types.js';
import type { HealthResponse } from '../../api/types/index.js';
import type { ProxyService } from '../tunnel/index.js';
import type { DirectOverrideStatus, RemoteAccessStatus, RemoteTestResult } from '../types.js';
import type { CloudflareManagedService, ManagedTunnelStatus } from './cloudflare-managed.js';
import type { TunnelConnections } from './tunnelConnections.js';

type ActiveMode = 'cloudflare' | 'cloudflareQuick' | 'customDomain' | null;

const FALLBACK_RECHECK_MS = 60_000;
const TUNNEL_REGISTER_TIMEOUT_MS = 30_000;
const TUNNEL_RETRY_MS = 600_000;
const TUNNEL_RETRY_MAX_MS = 4 * 3_600_000;
const ORIGIN_RECHECK_MS = 5_000;

export class RemoteAccessService {
  private remoteService: RemoteService;
  private cloudflareService: CloudflareService;
  private customDomainService: CustomDomainService;
  private urlReadiness: UrlReadinessGate;

  private remoteConfig: DBRemote;
  private activeMode: ActiveMode = null;
  private override: DirectOverrideStatus = { active: false, fallback: false };
  private fallbackReason: string | null = null;
  private reconcileChain: Promise<void> = Promise.resolve();
  private fallbackWatch: NodeJS.Timeout | null = null;
  private tunnelRetries = 0;
  private cloudEnabled: boolean;
  private cloudSwitch: Promise<void> = Promise.resolve();

  constructor(
    private logger: Logger,
    private proxyService: ProxyService,
  ) {
    this.remoteService = new RemoteService();
    this.urlReadiness = new UrlReadinessGate(this.logger, (url) => this.checkTunnelOrigin(url));
    this.cloudflareService = new CloudflareService(this.logger, (url) => this.urlReadiness.ensureReady(url));
    this.customDomainService = new CustomDomainService(this.logger);
    this.remoteConfig = this.remoteService.info();
    this.cloudEnabled = this.remoteConfig.enabled;
  }

  public async start(): Promise<void> {
    await this.reconcile();
  }

  public stop(): void {
    this.stopFallbackWatch();
    this.cloudflareService.stop();
    this.customDomainService.reset();
    this.urlReadiness.clear();
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

    if (this.cloudEnabled !== next.enabled) {
      this.cloudEnabled = next.enabled;
      this.cloudSwitch = this.cloudSwitch.then(() => this.updateWithCloud(next.enabled));
      await this.cloudSwitch;
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

    // a teardown mid-login kills the cloudflared that waits for the browser authorization
    if (directConfigChanged && !this.cloudflareService.managed.busy) {
      this.teardownActive();
    }
    this.tunnelRetries = 0;
    await this.reconcile();
  }

  public async restartTunnel(): Promise<void> {
    const tunnel = this.activeMode === 'cloudflare' || this.activeMode === 'cloudflareQuick';
    if (!tunnel || this.cloudflareService.managed.busy) return;
    this.teardownActive();
    await this.reconcile();
  }

  public getStatus(): RemoteAccessStatus {
    return {
      enabled: this.remoteConfig.enabled,
      directEnabled: this.remoteConfig.directEnabled,
      directMode: this.remoteConfig.directMode,
      externalUrl: this.activeExternalUrl(),
      override: { ...this.override },
      cloudflareError: this.cloudflareService.lastError ?? (this.override.fallback ? this.fallbackReason : null),
    };
  }

  public async reachableFromOutside(): Promise<boolean | null> {
    const cfg = this.remoteConfig;
    if (this.cloudflareService.managed.busy) return null;
    // a custom domain sits behind the user's own proxy, nothing to check from inside
    if (cfg.directEnabled && cfg.directMode === 'customDomain') return null;
    if (cfg.directEnabled && this.configuredConnections().registered) return true;
    if (cfg.enabled && this.remoteService.isCloudConnected()) return (await this.proxyService.getStatus()).connected;
    return cfg.directEnabled ? false : null;
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
    this.cloudflareService.managed
      .connect(hostname)
      .catch((err: any) => this.logger.error('Cloudflare managed connect failed:', err?.message ?? err))
      .finally(() => this.adoptManagedTunnel());
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

  private adoptManagedTunnel(): void {
    if (!this.cloudflareService.managed.runningUrl) return;
    this.stopFallbackWatch();
    this.tunnelRetries = 0;
    this.cloudflareService.stopOwnTunnel();
    this.activeMode = 'cloudflare';
    this.override = { active: true, fallback: false };
    this.logger.log('Cloudflare tunnel is up, leaving the Quick Tunnel:', this.cloudflareService.managed.runningUrl);
  }

  private async doReconcile(): Promise<void> {
    if (this.cloudflareService.managed.busy) {
      return;
    }

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
      this.startFallbackWatch();
      return;
    }

    this.ensureMode(cfg.directMode);
    const target = this.configuredTargetUrl();
    if (await this.targetWorks(target)) {
      this.tunnelRetries = 0;
      this.override = { active: true, fallback: false };
      return;
    }

    this.logger.warn(`Cloud-forced direct: configured '${cfg.directMode}' target ${target ?? '(none)'} not reachable — falling back to a Cloudflare Quick Tunnel.`);
    this.fallbackReason = this.cloudflareService.lastError;
    this.teardownActive();
    await this.cloudflareService.startQuick();
    this.activeMode = 'cloudflareQuick';
    this.override = { active: true, fallback: true };
    this.startFallbackWatch();
  }

  private async targetWorks(target: string | null): Promise<boolean> {
    if (this.remoteConfig.directMode === 'cloudflare') {
      return this.configuredConnections().whenRegistered(TUNNEL_REGISTER_TIMEOUT_MS, true);
    }
    if (!target) return false;
    if (await this.waitReachable(target)) return true;

    // no such signal for a custom domain: only a name that does not resolve publicly counts as dead
    try {
      return (await publicDnsAnswer(new URL(target).hostname)) !== 'no';
    } catch {
      return false;
    }
  }

  private async checkTunnelOrigin(url: string): Promise<void> {
    if (this.activeMode !== 'cloudflare' && this.activeMode !== 'cloudflareQuick') return;

    // the hostname resolves before cloudflared has an edge connection, the edge answers 530 until then
    const cloudflare = this.cloudflareService;
    const managed = this.activeMode === 'cloudflare' && this.remoteConfig.cloudflare?.mode === 'managed';
    const connections = managed ? cloudflare.managed.connections : cloudflare.connections;
    if (!(await connections.whenRegistered(TUNNEL_REGISTER_TIMEOUT_MS))) return;

    let result = await this.probeUrl(url);
    if (!result.ok) {
      await sleep(ORIGIN_RECHECK_MS);
      result = await this.probeUrl(url);
    }
    if (!result.ok && this.urlReadiness.isReady(url)) {
      this.logger.warn(`Cloudflare tunnel ${url} does not reach this server: ${result.message}`);
    }
  }

  private startFallbackWatch(): void {
    if (this.fallbackWatch || !this.configuredTargetUrl()) return;
    // retrying a named tunnel costs the quick tunnel its URL, so it backs off
    const delay = this.remoteConfig.directMode === 'cloudflare' ? Math.min(TUNNEL_RETRY_MAX_MS, TUNNEL_RETRY_MS * 2 ** this.tunnelRetries) : FALLBACK_RECHECK_MS;
    this.fallbackWatch = setTimeout(() => {
      this.fallbackWatch = null;
      this.recheckFallback();
    }, delay);
    this.fallbackWatch.unref();
  }

  private stopFallbackWatch(): void {
    if (!this.fallbackWatch) return;
    clearTimeout(this.fallbackWatch);
    this.fallbackWatch = null;
  }

  private async recheckFallback(): Promise<void> {
    const target = this.configuredTargetUrl();
    if (!target) return;

    // the quick tunnel holds cloudflared, so only starting the named tunnel again can test it
    if (this.remoteConfig.directMode === 'cloudflare') {
      this.tunnelRetries++;
      this.logger.log('Trying the configured Cloudflare tunnel again, the Quick Tunnel URL changes if it still fails.');
      this.teardownActive();
      await this.reconcile();
      return;
    }

    if (!(await this.probeUrl(target)).ok) {
      if (this.activeMode === 'cloudflareQuick') this.startFallbackWatch();
      return;
    }

    this.logger.log(`Configured direct target ${target} is reachable again, leaving the Cloudflare Quick Tunnel.`);
    this.stopFallbackWatch();
    this.teardownActive();
    await this.reconcile();
  }

  private ensureMode(mode: DBRemoteDirectMode): void {
    if (this.activeMode === mode && this.isActiveRunning()) {
      return;
    }
    if (this.cloudflareService.managed.busy) {
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
        message: this.cloudflareService.lastError ?? 'Cloudflare tunnel is not running',
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

  private configuredConnections(): TunnelConnections {
    const cloudflare = this.cloudflareService;
    return this.remoteConfig.cloudflare?.mode === 'managed' ? cloudflare.managed.connections : cloudflare.connections;
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
    let url: string | null = null;
    if (this.activeMode === 'cloudflare' || this.activeMode === 'cloudflareQuick') {
      url = this.cloudflareService.url;
    } else if (this.activeMode === 'customDomain') {
      url = this.customDomainService.url;
    }
    if (!url) return null;

    // clients that look up a not yet live hostname cache the NXDOMAIN for minutes
    if (!this.urlReadiness.isReady(url)) {
      this.urlReadiness.ensureReady(url);
      return null;
    }
    return url;
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
      const url = this.remoteConfig.customDomain.url?.trim();
      if (url) {
        this.customDomainService.configure(url);
        this.urlReadiness.ensureReady(url);
        this.customDomainService.testDomain(url);
      } else {
        this.customDomainService.reset();
      }
    }
  }

  private teardownActive(): void {
    this.stopFallbackWatch();
    if (this.activeMode === 'cloudflare' || this.activeMode === 'cloudflareQuick') {
      this.cloudflareService.stop();
    } else if (this.activeMode === 'customDomain') {
      this.customDomainService.reset();
    }
    this.urlReadiness.clear();
    this.activeMode = null;
  }

  private async updateWithCloud(enabled: boolean): Promise<void> {
    try {
      this.logger.log(`Updating cloud server: disabled=${!enabled}`);
      await this.remoteService.updateCloudServer(enabled);
    } catch (error) {
      this.logger.error('Failed to update cloud status:', error.message);
    }

    try {
      await (enabled ? this.proxyService.startAgent() : this.proxyService.stopAgent());
    } catch (error) {
      this.logger.error(`Failed to ${enabled ? 'start' : 'stop'} the tunnel agent:`, error?.message ?? error);
    }
  }
}
