import { sleep } from '@camera.ui/common/utils';
import { pathExists, remove } from 'fs-extra/esm';
import { execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { arch } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { BasePlatform } from './base.js';

export class Win32Installer extends BasePlatform {
  public async install(): Promise<void> {
    this.checkIsAdmin();

    await this.cli.portCheck();
    await this.cli.homePathCheck();

    try {
      // download nssm.exe to help create the service
      const nssmPath: string = await this.downloadNssm();

      // commands to run

      const installCmd =
        `"${nssmPath}" install ${this.cli.serviceName} ` +
        // eslint-disable-next-line no-useless-escape
        `"${process.execPath}" "\""${this.cli.selfPath}"\"" run -H "\""${this.cli.homePath}"\""${this.cli.worker ? ' --worker' : ''}`;
      const setUserDirCmd =
        `"${nssmPath}" set ${this.cli.serviceName} AppEnvironmentExtra ` +
        `":CAMERA_UI_HOME_PATH=${this.cli.homePath}` +
        `:CAMERA_UI_STORAGE_PATH=${this.cli.storagePath}"`;

      execSync(installCmd);
      execSync(setUserDirCmd);

      await this.configureFirewall();
      await this.start();
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async uninstall(): Promise<void> {
    this.checkIsAdmin();

    // stop existing service
    await this.stop();

    try {
      execSync(`sc delete ${this.cli.serviceName}`);
      this.cli.logger(`Removed ${this.cli.serviceName} service`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async reinstall(): Promise<void> {
    this.checkIsAdmin();

    await this.uninstall();
    await sleep(2000);
    await this.install();
  }

  public async start(restart?: boolean): Promise<void> {
    this.checkIsAdmin();

    try {
      execSync(`sc start ${this.cli.serviceName}`);
      this.cli.logger(`${this.cli.serviceName} ${restart ? 'restarted' : 'started'}`, 'succeed');
      await this.waitForApiAndPrintInstructions(restart ? 'restart' : 'start');
    } catch (error) {
      this.cli.logger(`Failed to ${restart ? 'restart' : 'start'} ${this.cli.serviceName}: ${error.message}`, 'fail');
    }
  }

  public async stop(): Promise<void> {
    this.checkIsAdmin();

    try {
      execSync(`sc stop ${this.cli.serviceName}`);
      this.cli.logger(`${this.cli.serviceName} stopped`, 'succeed');
    } catch (error) {
      this.cli.logger(`Failed to stop ${this.cli.serviceName}: ${error.message}`, 'fail');
    }
  }

  public async restart(): Promise<void> {
    this.checkIsAdmin();

    await this.stop();
    await sleep(2000);
    await this.start(true);
  }

  public getPersistedHomePath(): string | undefined {
    try {
      const output = execSync(`reg query "HKLM\\SYSTEM\\CurrentControlSet\\Services\\${this.cli.serviceName}\\Parameters" /v AppParameters`, {
        encoding: 'utf8',
      });
      return / -H "([^"]+)"/.exec(output)?.[1];
    } catch {
      return undefined;
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

  private checkIsAdmin(): void {
    try {
      execSync('fsutil dirty query %systemdrive% >nul');
    } catch {
      this.cli.logger('ERROR: This command must be run as an Administrator', 'fail');
      this.cli.logger('Node.js command prompt shortcut -> Right Click -> Run as administrator', 'fail');
      process.exit(1);
    }
  }

  private async downloadNssm(): Promise<string> {
    const fileName = `nssm_${arch()}.exe`;
    const downloadUrl = `https://github.com/homebridge/nssm/releases/download/2.24-101-g897c7ad/${fileName}`;
    const nssmPath = resolve(this.cli.homePath, 'nssm.exe');

    if (await pathExists(nssmPath)) {
      return nssmPath;
    }

    this.cli.logger(`Downloading NSSM from ${downloadUrl}`, 'info');

    try {
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      this.cli.logger(`Writing ${fileName} to ${nssmPath}`, 'info');
      const fileStream = createWriteStream(nssmPath, { flags: 'wx' });
      await finished(Readable.fromWeb(response.body as any).pipe(fileStream));

      return nssmPath;
    } catch (error) {
      // cleanup
      await remove(nssmPath);
      this.cli.logger(`Failed to download nssm: ${error.message}`, 'fail');
      throw error;
    }
  }

  private async configureFirewall(): Promise<void> {
    // firewall commands
    const cleanFirewallCmd = 'netsh advfirewall firewall Delete rule name="camera.ui"';
    const openFirewallCmd = `netsh advfirewall firewall add rule name="camera.ui" dir=in action=allow program="${process.execPath}"`;

    // try and remove any existing rules so there are not any duplicates
    try {
      execSync(cleanFirewallCmd);
    } catch {
      // this is probably ok, the firewall rule may not exist to remove
    }

    // create a new firewall rule
    try {
      execSync(openFirewallCmd);
    } catch (e) {
      this.cli.logger('Failed to configure firewall rule for camera.ui.', 'warn');
      this.cli.logger(e, 'warn');
    }
  }
}
