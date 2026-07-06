import { sleep } from '@camera.ui/common/utils';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';

import { BasePlatform } from './base.js';

export class DarwinInstaller extends BasePlatform {
  private user?: string;

  private get plistName(): string {
    return `com.${this.cli.serviceName.toLowerCase()}.server`;
  }

  private get plistPath(): string {
    return resolve('/Library/LaunchDaemons/', this.plistName + '.plist');
  }

  public async install(): Promise<void> {
    this.checkForRoot();

    await this.cli.portCheck();
    await this.cli.homePathCheck();

    try {
      const la = await this.createLaunchAgent();

      console.log('\r\n');
      console.log(la);
      console.log('\r\n');

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
      if (existsSync(this.plistPath)) {
        this.cli.logger(`Removed ${this.cli.serviceName} service`, 'succeed');
        unlinkSync(this.plistPath);
      } else {
        this.cli.logger(`Could not find installed ${this.cli.serviceName} service.`, 'fail');
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

  public async start(restart?: boolean): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`launchctl load -w ${this.plistPath}`);
      this.cli.logger(`${this.cli.serviceName} ${restart ? 'restarted' : 'started'}`, 'succeed');
      await this.waitForApiAndPrintInstructions(restart ? 'restart' : 'start');
    } catch (error) {
      this.cli.logger(`Failed to ${restart ? 'restart' : 'start'} ${this.cli.serviceName}: ${error.message}`, 'fail');
    }
  }

  public async stop(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`launchctl unload -w ${this.plistPath}`);
      this.cli.logger(`${this.cli.serviceName} stopped`, 'succeed');
    } catch (error) {
      this.cli.logger(`Failed to stop ${this.cli.serviceName}: ${error.message}`, 'fail');
    }
  }

  public async restart(): Promise<void> {
    this.checkForRoot();

    await this.stop();
    await sleep(2000);
    await this.start(true);
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
      return execSync(`lsof -n -iTCP:${port} -sTCP:LISTEN -t 2> /dev/null`).toString('utf8').trim();
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

  private checkForRoot(): void {
    if (process.getuid?.() !== 0) {
      this.cli.logger('ERROR: This command must be executed using sudo on macOS', 'fail');
      this.cli.logger(`sudo cameraui ${this.cli.action}`, 'fail');
      process.exit(1);
    }

    if (!process.env.SUDO_USER && !this.cli.asUser) {
      this.cli.logger('ERROR: Could not detect user. Pass in the user you want to run camera.ui as using the --user flag eg.', 'fail');
      this.cli.logger(`sudo cameraui ${this.cli.action} --user your-user`, 'fail');
      process.exit(1);
    }

    this.user = this.cli.asUser ?? process.env.SUDO_USER;
  }

  private async createLaunchAgent(): Promise<string> {
    const plistFileContents = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '    <key>RunAtLoad</key>',
      '        <true/>',
      '    <key>KeepAlive</key>',
      '        <true/>',
      '    <key>Label</key>',
      `        <string>${this.plistName}</string>`,
      '    <key>ProgramArguments</key>',
      '        <array>',
      `             <string>${process.execPath}</string>`,
      `             <string>${this.cli.selfPath}</string>`,
      '             <string>run</string>',
      '             <string>-H</string>',
      `             <string>${this.cli.homePath}</string>`,
      '        </array>',
      '    <key>WorkingDirectory</key>',
      `         <string>${this.cli.homePath}</string>`,
      '    <key>StandardOutPath</key>',
      `        <string>${this.cli.storagePath}/camera.ui.log</string>`,
      '    <key>StandardErrorPath</key>',
      `        <string>${this.cli.storagePath}/camera.ui.log</string>`,
      '    <key>UserName</key>',
      `        <string>${this.user}</string>`,
      '    <key>EnvironmentVariables</key>',
      '        <dict>',
      '            <key>PATH</key>',
      `                <string>${this.cli.processPath}</string>`,
      '            <key>HOME</key>',
      `                <string>${this.cli.getUserHomeDir()}</string>`,
      '            <key>CAMERA_UI_HOME_PATH</key>',
      `                <string>${this.cli.homePath}</string>`,
      '            <key>CAMERA_UI_STORAGE_PATH</key>',
      `                <string>${this.cli.storagePath}</string>`,
      '        </dict>',
      '</dict>',
      '</plist>',
    ]
      .filter((x) => x)
      .join('\n');

    await writeFile(this.plistPath, plistFileContents);

    return plistFileContents;
  }
}
