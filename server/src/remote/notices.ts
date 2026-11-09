import { Severity } from '@camera.ui/sdk';

import { inject } from '../container.js';
import { t } from '../i18n/index.js';
import { SystemNotificationTypeId } from '../manager/types.js';

const CHECK_INTERVAL_MS = 60_000;
// the tunnel agent and cloudflared reconnect on their own within a few minutes
const DOWN_CONFIRM_MS = 10 * 60_000;

export class RemoteNotices {
  private timer?: NodeJS.Timeout;
  private downSince = 0;
  private notified = false;

  constructor(private reachable: () => Promise<boolean | null>) {}

  private get notificationManager() {
    return inject('proxy').notificationManager;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  public stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async check(): Promise<void> {
    const reachable = await this.reachable();
    if (reachable === null) {
      this.downSince = 0;
      this.notified = false;
      return;
    }

    if (reachable) {
      if (this.notified) {
        this.notify('up', t('remote.up_title'), t('remote.up_body'), Severity.Info);
      }
      this.downSince = 0;
      this.notified = false;
      return;
    }

    this.downSince ||= Date.now();
    if (this.notified || Date.now() - this.downSince < DOWN_CONFIRM_MS) return;
    this.notified = true;
    this.notify('down', t('remote.down_title'), t('remote.down_body'), Severity.Warn);
  }

  private notify(state: 'down' | 'up', title: string, body: string, severity: Severity): void {
    this.notificationManager
      .notify({
        source: { kind: 'system', id: SystemNotificationTypeId.RemoteOffline },
        notification: {
          title,
          body,
          severity,
          tag: `${SystemNotificationTypeId.RemoteOffline}:${state}`,
          deepLink: '/settings/remote',
          adminOnly: true,
        },
      })
      .catch(() => {});
  }
}
