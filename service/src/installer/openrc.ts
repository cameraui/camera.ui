import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { LinuxInstaller } from './linux.js';

import type { PersistedInstall } from './base.js';

export function usesOpenRC(): boolean {
  // a systemd boot leaves /run/systemd/system behind, OpenRC (Alpine, Gentoo) brings openrc-run
  return !existsSync('/run/systemd/system') && existsSync('/sbin/openrc-run');
}

export class OpenRCInstaller extends LinuxInstaller {
  private get rcServiceName(): string {
    return this.cli.serviceName.toLowerCase();
  }

  private get rcServicePath(): string {
    return resolve('/etc/init.d', this.rcServiceName);
  }

  public async install(): Promise<void> {
    this.checkForRoot();

    await this.checkUser();
    await this.cli.portCheck();
    await this.cli.homePathCheck();

    try {
      await this.createRCService();
      execSync(`rc-update add ${this.rcServiceName} default`);
      await this.createFirewallRules();
      await this.start();
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async uninstall(): Promise<void> {
    this.checkForRoot();

    await this.stop();

    try {
      execSync(`rc-update del ${this.rcServiceName} default 2> /dev/null`);
    } catch (error) {
      this.cli.logger(`WARNING: failed to run "rc-update del ${this.rcServiceName}": ${error.message}`, 'warn');
    }

    try {
      if (existsSync(this.rcServicePath)) {
        rmSync(this.rcServicePath);
      }
      this.cli.logger(`Removed ${this.cli.serviceName} service`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async start(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`rc-service ${this.rcServiceName} start`, { stdio: 'inherit' });
      await this.waitForApiAndPrintInstructions('start');
    } catch (e) {
      this.cli.logger(`Failed to start ${this.cli.serviceName} - ` + e, 'fail');
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`rc-service ${this.rcServiceName} stop 2> /dev/null`);
      this.cli.logger(`${this.cli.serviceName} stopped`, 'succeed');
    } catch (e) {
      this.cli.logger(`Failed to stop ${this.rcServiceName} - ` + e, 'fail');
    }
  }

  public async restart(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`rc-service ${this.rcServiceName} restart`, { stdio: 'inherit' });
      this.cli.logger(`${this.cli.serviceName} restarted`, 'succeed');
      await this.waitForApiAndPrintInstructions('restart');
    } catch (e) {
      this.cli.logger(`Failed to restart ${this.cli.serviceName} - ` + e, 'fail');
    }
  }

  public getPersistedInstall(): PersistedInstall {
    try {
      const script = readFileSync(this.rcServicePath, 'utf8');
      return {
        homePath: /^export CAMERA_UI_HOME_PATH="([^"]+)"$/m.exec(script)?.[1],
        worker: /^command_args=.* --worker"$/m.test(script),
        user: /^command_user="([^"]+)"$/m.exec(script)?.[1],
      };
    } catch {
      return {};
    }
  }

  public warnOutdatedService(): void {}

  public serviceStateCommand(): string {
    return `rc-service ${this.rcServiceName} status`;
  }

  private async createRCService(): Promise<void> {
    const script = [
      '#!/sbin/openrc-run',
      '',
      `description="${this.cli.serviceName}"`,
      `command="${this.cli.selfPath}"`,
      `command_args="run -H \\"${this.cli.homePath}\\"${this.cli.worker ? ' --worker' : ''}"`,
      `command_user="${this.cli.asUser}"`,
      `directory="${this.cli.homePath}"`,
      'supervisor="supervise-daemon"',
      'respawn_delay=3',
      'respawn_max=0',
      // SIGTERM to the launcher only, so the server and its children stop in order
      'retry="TERM/30/KILL/5"',
      '',
      `export CAMERA_UI_HOME_PATH="${this.cli.homePath}"`,
      `export CAMERA_UI_STORAGE_PATH="${this.cli.storagePath}"`,
      'export DISABLE_OPENCOLLECTIVE=true',
      // keep openrc-run's own PATH behind it, its helpers (checkpath, einfo) live there
      `export PATH="${this.servicePath()}:$PATH"`,
      '',
      'depend() {',
      '  need net',
      '  use dns logger',
      '}',
      '',
      'start_pre() {',
      '  checkpath -d -o "${command_user}" "${CAMERA_UI_HOME_PATH}" "${CAMERA_UI_STORAGE_PATH}"',
      '  chown -R "${command_user}": "${CAMERA_UI_HOME_PATH}" "${CAMERA_UI_STORAGE_PATH}"',
      '  sysctl -w net.core.rmem_default=5242880 net.core.rmem_max=5242880 > /dev/null 2>&1 || true',
      '  "${command}" before-start || true',
      '}',
      '',
    ].join('\n');

    await writeFile(this.rcServicePath, script);
    await chmod(this.rcServicePath, '755');
  }
}
