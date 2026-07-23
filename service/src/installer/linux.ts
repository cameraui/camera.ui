import { APP_CLI_NAME, sleep } from '@camera.ui/common';
import { getNpmGlobalModulesDirectory } from '@camera.ui/common/node';
import { mkdirp, pathExists } from 'fs-extra/esm';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { chmod, readdir, rm, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { osInfo } from 'systeminformation';

import { BasePlatform } from './base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class LinuxInstaller extends BasePlatform {
  private get systemdServiceName() {
    return this.cli.serviceName.toLowerCase();
  }

  private get systemdServicePath(): string {
    return resolve('/etc/systemd/system', this.systemdServiceName + '.service');
  }

  private get systemdEnvPath(): string {
    return resolve('/etc/default', this.systemdServiceName);
  }

  private get runPartsPath(): string {
    return resolve('/etc/cameraui', this.cli.serviceName.toLowerCase(), 'prestart.d');
  }

  public async install(): Promise<void> {
    this.checkForRoot();

    await this.checkUser();
    this.setupSudo();
    await this.cli.portCheck();
    await this.cli.homePathCheck();

    try {
      await this.createSystemdEnvFile();
      await this.createSystemdService();
      await this.createRunPartsPath();
      await this.reloadSystemd();
      await this.enableService();
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

    // try and disable the service
    await this.disableService();

    try {
      if (existsSync(this.systemdServicePath)) {
        rmSync(this.systemdServicePath);
      }
      if (existsSync(this.systemdEnvPath)) {
        rmSync(this.systemdEnvPath);
      }
      if (existsSync(this.runPartsPath)) {
        rmSync(this.runPartsPath, { recursive: true });
      }

      // reload services
      await this.reloadSystemd();

      this.cli.logger(`Removed ${this.cli.serviceName} service`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.cli.logger('ERROR: Failed Operation', 'fail');
    }
  }

  public async reinstall(): Promise<void> {
    await this.uninstall();
    await sleep(2000);
    await this.install();
  }

  public async start(): Promise<void> {
    this.checkForRoot();
    this.fixPermissions();

    try {
      execSync(`systemctl start ${this.systemdServiceName}`);
      execSync(`systemctl status ${this.systemdServiceName} --no-pager`);
      await this.waitForApiAndPrintInstructions('start');
    } catch (e) {
      this.cli.logger(`Failed to start ${this.cli.serviceName} - ` + e, 'fail');
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    this.checkForRoot();

    try {
      execSync(`systemctl stop ${this.systemdServiceName} 2>/dev/null`);
      this.cli.logger(`${this.cli.serviceName} stopped`, 'succeed');
    } catch (e) {
      this.cli.logger(`Failed to stop ${this.systemdServiceName} - ` + e, 'fail');
    }
  }

  public async restart(): Promise<void> {
    this.checkForRoot();
    this.fixPermissions();

    try {
      execSync(`systemctl restart ${this.systemdServiceName}`);
      execSync(`systemctl status ${this.systemdServiceName} --no-pager`);
      this.cli.logger(`${this.cli.serviceName} restarted`, 'succeed');
      await this.waitForApiAndPrintInstructions('restart');
    } catch (e) {
      this.cli.logger(`Failed to restart ${this.cli.serviceName} - ` + e, 'fail');
    }
  }

  public async beforeStart(): Promise<void> {
    const tempModuleName = '.' + APP_CLI_NAME;
    const backPath = APP_CLI_NAME.split('/')
      .map(() => '..')
      .join('/');
    const baseDir = resolve(__dirname, '..', '..', backPath);

    if ([getNpmGlobalModulesDirectory()].includes(dirname(baseDir))) {
      // systemd has a 90-second default timeout in the pre-start jobs
      // terminate this task after 60 seconds to be safe
      setTimeout(() => {
        process.exit(0);
      }, 60000);

      const modulesPath = join(dirname(baseDir), APP_CLI_NAME.split('/')[0]);
      const temporaryDirectoriesToClean = (await readdir(modulesPath)).filter((x) => x.startsWith(tempModuleName));

      for (const directory of temporaryDirectoriesToClean) {
        const pathToRemove = join(modulesPath, directory);
        try {
          console.log('Removing stale temporary directory:', pathToRemove);
          await rm(pathToRemove, { recursive: true, force: true });
        } catch (e) {
          console.error('Failed to remove:', pathToRemove, e);
        }
      }
    }

    process.exit(0);
  }

  public getPersistedHomePath(): string | undefined {
    try {
      const env = readFileSync(this.systemdEnvPath, 'utf8');
      return /^CAMERA_UI_HOME_PATH="?([^"\n]+)"?$/m.exec(env)?.[1];
    } catch {
      return undefined;
    }
  }

  public async getId(): Promise<{ uid: number; gid: number }> {
    if (process.getuid?.() === 0 && this.cli.asUser) {
      const uid = execSync(`id -u ${this.cli.asUser}`).toString('utf8');
      const gid = execSync(`id -g ${this.cli.asUser}`).toString('utf8');
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
      if (this.cli.isDocker) {
        return execSync('pidof cui').toString('utf8').trim();
      } else {
        return execSync(`fuser ${port}/tcp 2>/dev/null`).toString('utf8').trim();
      }
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

  private async reloadSystemd(): Promise<void> {
    try {
      execSync('systemctl daemon-reload');
    } catch (error) {
      this.cli.logger(`WARNING: failed to run "systemctl daemon-reload": ${error.message}`, 'warn');
    }
  }

  private async enableService(): Promise<void> {
    try {
      execSync(`systemctl enable ${this.systemdServiceName} 2> /dev/null`);
    } catch (error) {
      this.cli.logger(`WARNING: failed to run "systemctl enable ${this.systemdServiceName}": ${error.message}`, 'warn');
    }
  }

  private async disableService(): Promise<void> {
    try {
      execSync(`systemctl disable ${this.systemdServiceName} 2> /dev/null`);
    } catch (error) {
      this.cli.logger(`WARNING: failed to run "systemctl disable ${this.systemdServiceName}": ${error.message}`, 'warn');
    }
  }

  private checkForRoot(): void {
    if (process.getuid?.() !== 0) {
      this.cli.logger('ERROR: This command must be executed using sudo on Linux', 'fail');
      this.cli.logger(`EXAMPLE: sudo cameraui ${this.cli.action}`, 'fail');
      process.exit(1);
    }

    if ((this.cli.action === 'install' || this.cli.action === 'reinstall') && !this.cli.asUser) {
      this.cli.logger('ERROR: User parameter missing. Pass in the user you want to run camera.ui as using the --user flag eg.', 'fail');
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
      execSync(`useradd -m --system ${this.cli.asUser}`);
      this.cli.logger(`Created service user: ${this.cli.asUser}`, 'info');
      if (this.cli.addGroup) {
        execSync(`usermod -a -G ${this.cli.addGroup} ${this.cli.asUser}`, { timeout: 10000 });
        this.cli.logger(`Added ${this.cli.asUser} to group ${this.cli.addGroup}`, 'info');
      }
    }

    try {
      // try and add the user to commonly required groups if on Raspbian
      const os = await osInfo();
      if (os.distro === 'Raspbian GNU/Linux') {
        execSync(`usermod -a -G audio,bluetooth,dialout,gpio,video ${this.cli.asUser} 2> /dev/null`);
        execSync(`usermod -a -G input,i2c,spi ${this.cli.asUser} 2> /dev/null`);
      }
    } catch {
      // do nothing
    }
  }

  private fixPermissions(): void {
    if (existsSync(this.systemdServicePath) && existsSync(this.systemdEnvPath)) {
      try {
        // extract the user this process is running as
        const serviceUser = execSync(`cat "${this.systemdServicePath}" | grep "User=" | awk -F'=' '{print $2}'`).toString('utf8').trim();

        // get the home/storage path (we may not know it when running the start command)
        const homePath = execSync(`cat "${this.systemdEnvPath}" | grep "CAMERA_UI_HOME_PATH" | awk -F'=' '{print $2}' | sed -e 's/^"//' -e 's/"$//'`)
          .toString('utf8')
          .trim();

        const storagePath = execSync(`cat "${this.systemdEnvPath}" | grep "CAMERA_UI_STORAGE_PATH" | awk -F'=' '{print $2}' | sed -e 's/^"//' -e 's/"$//'`)
          .toString('utf8')
          .trim();

        if (existsSync(homePath)) {
          execSync(`chown -R ${serviceUser}: "${homePath}"`);
        }

        if (existsSync(storagePath)) {
          execSync(`chown -R ${serviceUser}: "${storagePath}"`);
        }

        execSync(`chmod a+x ${this.cli.selfPath}`);
      } catch (error) {
        this.cli.logger(`WARNING: Failed to set permissions: ${error.message}`, 'warn');
      }
    }
  }

  private async createFirewallRules(): Promise<void> {
    // check ufw is present on the system (debian based linux)
    if (await pathExists('/usr/sbin/ufw')) {
      return await this.createUfwRules();
    }

    // check firewall-cmd is present on the system (enterprise linux)
    if (await pathExists('/usr/bin/firewall-cmd')) {
      return await this.createFirewallCmdRules();
    }
  }

  private async createUfwRules(): Promise<void> {
    try {
      // check the firewall is active before doing anything
      const status = execSync('/bin/echo -n "$(ufw status)" 2> /dev/null').toString('utf8');
      if (!status.includes('Status: active')) {
        return;
      }

      // add ui rule
      execSync(`ufw allow ${this.cli.uiPort}/tcp 2> /dev/null`);
      this.cli.logger(`Added firewall rule to allow inbound traffic on port ${this.cli.uiPort}/tcp`, 'info');
    } catch (error) {
      this.cli.logger(`WARNING: failed to allow ports through firewall: ${error.message}`, 'warn');
    }
  }

  private async createFirewallCmdRules(): Promise<void> {
    try {
      // check the firewall is running before doing anything
      const status = execSync('/bin/echo -n "$(firewall-cmd --state)" 2> /dev/null').toString('utf8');
      if (status !== 'running') {
        return;
      }
      // add ui rule
      execSync(`firewall-cmd --permanent --add-port=${this.cli.uiPort}/tcp 2> /dev/null`);
      this.cli.logger(`Added firewall rule to allow inbound traffic on port ${this.cli.uiPort}/tcp`, 'info');

      // reload the firewall
      execSync('firewall-cmd --reload 2> /dev/null');
      this.cli.logger('Firewall reloaded', 'info');
    } catch (error) {
      this.cli.logger(`WARNING: failed to allow ports through firewall: ${error.message}`, 'warn');
    }
  }

  private async createRunPartsPath(): Promise<void> {
    await mkdirp(this.runPartsPath);

    const permissionScriptPath = resolve(this.runPartsPath, '10-fix-permissions');
    const permissionScript = [
      '#!/bin/sh',
      '',
      '# Function to set a safe PATH',
      'set_safe_path() {',
      '    echo "Setting safe PATH..."',
      '    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/homebridge/bin',
      '    export PATH',
      '}',
      '',
      '# Function to ensure correct permissions',
      'ensure_permissions() {',
      '    local path="$1"',
      '    local owner="$2"',
      '    echo "Ensuring $path is owned by $owner"',
      '    [ -d "$path" ] || mkdir -p "$path"',
      '    if ! chown -R "$owner": "$path" 2>/dev/null; then',
      '        echo "chown failed. Attempting to set a safe PATH."',
      '        set_safe_path',
      '        if ! chown -R "$owner": "$path"; then',
      '            echo "chown still failed after setting safe PATH. Please check your system configuration."',
      '            return 1',
      '        fi',
      '    fi',
      '}',
      '',
      '# Check if chown is available',
      'if ! command -v chown >/dev/null 2>&1; then',
      '    echo "chown not found in current PATH. Setting safe PATH."',
      '    set_safe_path',
      'fi',
      '',
      '# Ensure the home path permissions are correct',
      'if [ -n "$CAMERA_UI_HOME_PATH" ] && [ -n "$USER" ]; then',
      '    ensure_permissions "$CAMERA_UI_HOME_PATH" "$USER" || exit 1',
      'fi',
      '',
      '# Ensure the storage path permissions are correct',
      'if [ -n "$CAMERA_UI_STORAGE_PATH" ] && [ -n "$USER" ]; then',
      '    ensure_permissions "$CAMERA_UI_STORAGE_PATH" "$USER" || exit 1',
      'fi',
      '',
      '# Set sysctl values for camera.ui',
      `${execSync('which sysctl').toString('utf8').trim()} -w net.core.rmem_default=5242880`,
      `${execSync('which sysctl').toString('utf8').trim()} -w net.core.rmem_max=5242880`,
    ]
      .filter((x) => x !== null)
      .join('\n');

    await writeFile(permissionScriptPath, permissionScript);
    await chmod(permissionScriptPath, '755');
  }

  private setupSudo() {
    try {
      const sysctlPath = execSync('which sysctl').toString('utf8').trim();
      const sudoersEntry = `${this.cli.asUser}    ALL=(ALL) NOPASSWD:SETENV: ${sysctlPath}}}`;

      // check if the sudoers file already contains the entry
      const sudoers = readFileSync('/etc/sudoers', 'utf-8');
      if (sudoers.includes(sudoersEntry)) {
        return;
      }

      // grant the user restricted sudo privileges to /sbin/sysctl
      execSync(`echo '${sudoersEntry}' | sudo EDITOR='tee -a' visudo`);
    } catch (error) {
      this.cli.logger(`WARNING: Failed to setup /etc/sudoers, you may see performance issues when streaming: ${error.message}`, 'warn');
    }
  }

  private async createSystemdEnvFile(): Promise<void> {
    const envFile = [
      `CAMERA_UI_OPTS=-H "${this.cli.homePath}"${this.cli.worker ? ' --worker' : ''}`,
      `CAMERA_UI_HOME_PATH="${this.cli.homePath}"`,
      `CAMERA_UI_STORAGE_PATH="${this.cli.storagePath}"`,
      '',
      'DISABLE_OPENCOLLECTIVE=true',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/homebridge/bin',
    ]
      .filter((x) => x !== null)
      .join('\n');

    await writeFile(this.systemdEnvPath, envFile);
  }

  private async createSystemdService(): Promise<void> {
    const serviceFile = [
      '[Unit]',
      `Description=${this.cli.serviceName}`,
      'Wants=network-online.target',
      'After=syslog.target network-online.target',
      '',
      '[Service]',
      'Type=simple',
      `User=${this.cli.asUser}`,
      'PermissionsStartOnly=true',
      `WorkingDirectory=${this.cli.homePath}`,
      `EnvironmentFile=/etc/default/${this.systemdServiceName}`,
      `ExecStartPre=-/bin/run-parts ${this.runPartsPath}`,
      `ExecStartPre=-${this.cli.selfPath} before-start $CAMERA_UI_OPTS`,
      `ExecStart=${this.cli.selfPath} run $CAMERA_UI_OPTS`,
      'Restart=always',
      'RestartSec=3',
      'KillMode=process',
      // eslint-disable-next-line @stylistic/max-len
      'CapabilityBoundingSet=CAP_IPC_LOCK CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW CAP_SETGID CAP_SETUID CAP_SYS_CHROOT CAP_CHOWN CAP_FOWNER CAP_DAC_OVERRIDE CAP_AUDIT_WRITE CAP_SYS_ADMIN',
      'AmbientCapabilities=CAP_NET_RAW CAP_NET_BIND_SERVICE',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
    ]
      .filter((x) => x !== null)
      .join('\n');

    await writeFile(this.systemdServicePath, serviceFile);
  }
}
