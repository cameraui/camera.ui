import { sleep } from '@camera.ui/common/utils';
import { outputFile } from 'fs-extra/esm';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';

import { BasePlatform } from './base.js';

export class FreeBSDInstaller extends BasePlatform {
  private get rcServiceName(): string {
    return this.cli.serviceName.toLowerCase();
  }

  private get rcServicePath(): string {
    return resolve('/usr/local/etc/rc.d', this.rcServiceName);
  }

  public async install(): Promise<void> {
    this.checkForRoot();

    await this.checkUser();
    await this.cli.portCheck();
    await this.cli.homePathCheck();

    try {
      await this.createRCService();
      await this.enableService();
      await this.start();
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async uninstall(): Promise<void> {
    this.checkForRoot();

    await this.stop();

    // try and disable the service
    await this.disableService();

    try {
      if (existsSync(this.rcServicePath)) {
        this.cli.logger(`Removed ${this.rcServiceName} service`, 'succeed');
        unlinkSync(this.rcServicePath);
      } else {
        this.cli.logger(`Could not find installed ${this.rcServiceName} service.`, 'fail');
      }
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async reinstall(): Promise<void> {
    this.checkForRoot();

    await this.uninstall();
    await sleep(2000);
    await this.install();
  }

  public async start(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`service ${this.rcServiceName} start`, { stdio: 'inherit' });
      this.cli.logger(`${this.rcServiceName} started`, 'succeed');
      await this.waitForApiAndPrintInstructions('start');
    } catch (error) {
      this.cli.logger(`Failed to start ${this.rcServiceName}: ${error.message}`, 'fail');
    }
  }

  public async stop(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`service ${this.rcServiceName} stop`, { stdio: 'inherit' });
      this.cli.logger(`${this.rcServiceName} stopped`, 'succeed');
    } catch (error) {
      this.cli.logger(`Failed to stop ${this.rcServiceName}: ${error.message}`, 'fail');
    }
  }

  public async restart(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`service ${this.rcServiceName} restart`, { stdio: 'inherit' });
      this.cli.logger(`${this.rcServiceName} restarted`, 'succeed');
      await this.waitForApiAndPrintInstructions('restart');
    } catch (error) {
      this.cli.logger(`Failed to restart ${this.rcServiceName}: ${error.message}`, 'fail');
    }
  }

  public async getId(): Promise<{ uid: number; gid: number }> {
    if ((process.getuid?.() === 0 && this.cli.asUser) || process.env.SUDO_USER) {
      const uid = execSync(`id -u ${this.cli.asUser ?? process.env.SUDO_USER}`).toString('utf8');
      const gid = execSync(`id -g ${this.cli.asUser ?? process.env.SUDO_USER}`).toString('utf8');

      return {
        uid: parseInt(uid, 10),
        gid: parseInt(gid, 10),
      };
    } else {
      return {
        uid: userInfo().uid,
        gid: userInfo().gid,
      };
    }
  }

  public getPidOfPort(port: number): string | null {
    try {
      return execSync(`sockstat -P tcp -p ${port} -l -q 2> /dev/null | awk '{print $3}' | head -n 1`).toString('utf8').trim();
    } catch {
      return null;
    }
  }

  private async waitForApiAndPrintInstructions(type: 'start' | 'restart'): Promise<void> {
    const apiReady = await this.cli.waitForApiHealth();

    if (apiReady) {
      await this.cli.printPostInstallInstructions(type);
    } else {
      this.cli.logger('WARNING: There might be errors, or the setup might still be in progress.\n' + '  You can check the logs using the command: cameraui logs', 'warn');
    }
  }

  private async enableService(): Promise<void> {
    try {
      execSync(`sysrc ${this.rcServiceName}_enable="YES" 2> /dev/null`);
    } catch (error) {
      this.cli.logger(`WARNING: failed to run sysrc ${this.rcServiceName}_enable="YES": ${error.message}`, 'warn');
    }
  }

  private async disableService(): Promise<void> {
    try {
      execSync(`sysrc ${this.rcServiceName}_enable="NO" 2> /dev/null`);
    } catch (error) {
      this.cli.logger(`WARNING: failed to run sysrc ${this.rcServiceName}_enable="NO": ${error.message}`, 'warn');
    }
  }

  private checkForRoot(): void {
    if (process.getuid?.() !== 0) {
      this.cli.logger('ERROR: This command must be executed using sudo on FreeBSD', 'fail');
      this.cli.logger(`EXAMPLE: sudo cameraui ${this.cli.action}`, 'fail');
      process.exit(1);
    }

    if (this.cli.action === 'install' && !process.env.SUDO_USER && !this.cli.asUser) {
      this.cli.logger('ERROR: Could not detect user. Pass in the user you want to run camera.ui as using the --user flag eg.', 'fail');
      this.cli.logger(`EXAMPLE: sudo cameraui ${this.cli.action} --user your-user`, 'fail');
      process.exit(1);
    }
  }

  private async checkUser(): Promise<void> {
    try {
      // check if user exists
      execSync(`id ${this.cli.asUser} 2> /dev/null`);
    } catch {
      // if not create the user
      execSync(`pw useradd -q -n ${this.cli.asUser} -s /usr/sbin/nologin 2> /dev/null`);
      this.cli.logger(`Created service user: ${this.cli.asUser}`, 'info');
    }
  }

  private async createRCService(): Promise<void> {
    const sysctlPath = execSync('which sysctl').toString().trim();
    const rcFileContents = [
      '#!/bin/sh',
      '#',
      '# PROVIDE: ' + this.rcServiceName,
      '# REQUIRE: NETWORKING SYSLOG',
      '# KEYWORD: shutdown',
      '#',
      '# Add the following lines to /etc/rc.conf to enable ' + this.rcServiceName + ':',
      '#',
      '#' + this.rcServiceName + '_enable="YES"',
      '',
      '. /etc/rc.subr',
      '',
      'name="' + this.rcServiceName + '"',
      'rcvar="' + this.rcServiceName + '_enable"',
      '',
      'load_rc_config $name',
      '',
      ': ${' + this.rcServiceName + '_user:="' + this.cli.asUser + '"}',
      ': ${' + this.rcServiceName + '_enable:="NO"}',
      ': ${' + this.rcServiceName + '_facility:="daemon"}',
      ': ${' + this.rcServiceName + '_priority:="debug"}',
      ': ${' + this.rcServiceName + '_home_path:="' + this.cli.homePath + '"}',
      ': ${' + this.rcServiceName + '_storage_path:="' + this.cli.storagePath + '"}',
      '',
      'export HOME="$(eval echo ~${' + this.rcServiceName + '_user})"',
      'export PATH=/usr/local/bin:${PATH}',
      '',
      'pidfile="/var/run/${name}.pid"',
      'command="/usr/sbin/daemon"',
      'procname="daemon"',
      'command_args=" -c -f -R 3 -P ${pidfile} ' + this.cli.selfPath + ` run -H ${this.cli.homePath}${this.cli.worker ? ' --worker' : ''}"`,
      'start_precmd="cameraui_precmd"',
      '',
      'start_precmd="${name}_precmd"',
      '',
      '${name}_precmd()',
      '{',
      '   sleep 10',
      '   chown -R ${' + this.rcServiceName + '_user}: ${' + this.rcServiceName + '_home_path}',
      '   chown -R ${' + this.rcServiceName + '_user}: ${' + this.rcServiceName + '_storage_path}',
      '   install -o ${' + this.rcServiceName + '_user} /dev/null ${pidfile}',
      '   # Set sysctl values for better network performance',
      `   ${sysctlPath} net.inet.udp.recvspace=5242880`,
      '}',
      '',
      'run_rc_command "$1"',
    ]
      .filter((x) => x)
      .join('\n');

    await outputFile(this.rcServicePath, rcFileContents);
    await chmod(this.rcServicePath, '755');
  }
}
