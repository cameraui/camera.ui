import type { Logger } from '@camera.ui/common';
import type { HealthResponse } from '../../api/types/index.js';

export class CustomDomainService {
  private domain: string | null = null;

  constructor(private logger: Logger) {}

  public get url(): string | null {
    return this.domain;
  }

  public async testDomain(domain: string): Promise<boolean> {
    try {
      const url = new URL(domain);
      const base = url.toString().replace(/\/+$/, '');

      const response = await fetch(`${base}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const message = (await response.text()) ?? `${response.statusText} (${response.status})`;
        throw new Error(`Failed to connect to custom domain: ${message}`);
      }

      const health: HealthResponse = await response.json();
      if (health.status !== 'ok') {
        throw new Error('Health check failed: ' + JSON.stringify(health));
      }

      this.logger.log('Custom domain verified:', base);
      this.domain = base;
      return true;
    } catch (error) {
      this.logger.error('Custom Domain:', error);
      this.domain = null;
      return false;
    }
  }

  public reset(): void {
    this.domain = null;
  }
}
