#!/usr/bin/env node

process.title = 'camera.ui-service';

import { isPortInUse } from '@camera.ui/common/net';
import { getUserHomeDir } from '@camera.ui/common/node';
import { IS_DEV, IS_DOCKER, SignalHandler, sleep } from '@camera.ui/common/utils';
import { program } from 'commander';
import { mkdirp, pathExists, readJsonSync } from 'fs-extra/esm';
import { request } from 'https';
import { load } from 'js-yaml';
import { execSync } from 'node:child_process';
import { chownSync, createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { arch, cpus, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ora from 'ora';
import { networkInterfaceDefault, networkInterfaces } from 'systeminformation';
import { Tail } from 'tail';

import { DarwinInstaller } from './installer/darwin.js';
import { FreeBSDInstaller } from './installer/freebsd.js';
import { LinuxInstaller } from './installer/linux.js';
import { Win32Installer } from './installer/win32.js';
import { CLILogger } from './logger.js';
import { ServerManager } from './manager.js';

import type { PathLike } from 'fs-extra';
import type { BasePlatform } from './installer/base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class CameraUiCLI {
  public readonly DEFAULT_PORT = 3443;
  public selfPath = __filename;
  public processPath = (process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin') + ':/opt/homebridge/bin';

  public action!: 'install' | 'uninstall' | 'reinstall' | 'before-start' | 'start' | 'stop' | 'restart' | 'run' | 'logs' | 'status' | 'update-server';
  public homePath!: string;
  public storagePath!: string;
  public serviceName = 'cameraui';
  public allowRunRoot = false;
  public worker = false;
  public asUser?: string;
  public addGroup?: string;
  public docker?: boolean;
  public uid?: number;
  public gid?: number;
  public updateVersion?: string;

  private installer!: BasePlatform;
  private logging: CLILogger;
  private signalHandler?: SignalHandler;
  private serverManager: ServerManager;

  private shuttingDown = false;
  private shuttingDownNodemon = false;

  private restartTimeout?: NodeJS.Timeout;

  private restartAttempts = 0;
  private lastStartTime = 0;
  private readonly MAX_RESTART_ATTEMPTS = 5;
  private readonly BASE_RESTART_DELAY = 2000;
  private readonly MAX_RESTART_DELAY = 60000;
  private readonly STABLE_RUN_MS = 30000;

  get abortRestart(): boolean {
    return this.shuttingDownNodemon || this.serverManager.serverCrashed;
  }

  get isDocker(): boolean {
    return IS_DOCKER ?? this.docker ?? false;
  }

  get logPath(): string {
    return join(this.storagePath, 'camera.ui.log');
  }

  get configFilePath(): string {
    return join(this.storagePath, 'camera.ui.yaml');
  }

  get uiPort(): number {
    try {
      const config: any = load(readFileSync(this.configFilePath, 'utf-8'));
      return config.port;
    } catch {
      return this.DEFAULT_PORT;
    }
  }

  constructor() {
    this.nodeVersionCheck();
    this.createInstaller();
    this.cli();
    this.setEnv();

    this.logging = new CLILogger(this.logPath, this.action);
    this.serverManager = new ServerManager(this);

    this.runAction();
  }

  public logger(msg: string, level: 'info' | 'succeed' | 'fail' | 'warn' | 'debug' | 'raw', write?: boolean): void {
    this.logging.log(msg, level, write);
  }

  public async printPostInstallInstructions(type: 'start' | 'restart' | 'status'): Promise<void> {
    const defaultAdapter = await networkInterfaceDefault();
    const netInterfaces = await networkInterfaces();

    // prettier-ignore
    const defaultInterface = Array.isArray(netInterfaces)
      ? netInterfaces.find((x: any) => x.iface === defaultAdapter)
      : (netInterfaces as any).iface === defaultAdapter
          ? netInterfaces
          : null;

    console.log('\nManage camera.ui by going to one of the following in your browser:\n');

    console.log(`* https://localhost:${this.uiPort}`);

    if (defaultInterface?.ip4) {
      console.log(`* https://${defaultInterface.ip4}:${this.uiPort}`);
    }

    if (defaultInterface?.ip6) {
      console.log(`* https://[${defaultInterface.ip6}]:${this.uiPort}`);
    }

    if (type !== 'status') {
      console.log('');

      this.logger(`camera.ui ${type} complete`, 'succeed');
    }
  }

  public async portCheck(): Promise<void> {
    const inUse = await isPortInUse(this.uiPort);

    if (inUse) {
      this.logger(`ERROR: Port ${this.uiPort} is already in use by another process on this host.`, 'fail');
      this.logger('You can change the port in the camera.ui config file.', 'fail');
      process.exit(1);
    }
  }

  public async homePathCheck(): Promise<void> {
    if (!(await pathExists(this.homePath))) {
      this.logger(`Creating camera.ui home directory: ${this.homePath}`, 'info');
      await mkdirp(this.homePath);
      await this.chownPath(this.homePath);
    }

    await this.storagePathCheck();
  }

  public async chownPath(pathToChown: PathLike): Promise<void> {
    if (platform() !== 'win32' && process.getuid?.() === 0) {
      const { uid, gid } = await this.installer.getId();
      chownSync(pathToChown, uid, gid);
    }
  }

  public getUserHomeDir(): string {
    return getUserHomeDir(this.asUser);
  }

  public async waitForApiHealth(maxWaitTime = 300000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds

    let logsCommand = 'cameraui logs';
    if (this.homePath && this.homePath !== join(this.getUserHomeDir(), '.camera.ui')) {
      logsCommand += ` -H "${this.homePath}"`;
    }

    this.logger('Setup in progress. To view installation logs in real-time, run this in another terminal:', 'info');
    this.logger(`  ${logsCommand}`, 'info');

    const spinner = ora({
      text: 'Initializing UI (this may take a few minutes)...',
      color: 'cyan',
    }).start();

    let dots = 0;
    const updateSpinner = setInterval(() => {
      dots = (dots + 1) % 4;
      const progressDots = '.'.repeat(dots);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeText = minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`;

      spinner.text = `Waiting for UI to become available (${timeText} elapsed)${progressDots}`;
    }, 1000);

    try {
      while (Date.now() - startTime < maxWaitTime) {
        try {
          const isHealthy = await this.fetchApiHealth();
          if (isHealthy) {
            clearInterval(updateSpinner);
            spinner.succeed('UI is now available!');
            return true;
          }
        } catch {
          // UI not ready yet, continue waiting
        }

        await sleep(checkInterval);
      }

      clearInterval(updateSpinner);
      spinner.fail('UI did not become available within the expected time.');
      return false;
    } catch (error) {
      clearInterval(updateSpinner);
      spinner.fail(`Error checking UI health: ${error.message}`);
      return false;
    }
  }

  private nodeVersionCheck(): void {
    // 115 = v20;
    if (parseInt(process.versions.modules, 10) < 64) {
      this.logger(`ERROR: Node.js v20 or greater is required. Current: ${process.version}.`, 'fail');
      process.exit(1);
    }
  }

  private createInstaller(): void {
    switch (platform()) {
      case 'linux':
        this.installer = new LinuxInstaller(this);
        break;
      case 'win32':
        this.installer = new Win32Installer(this);
        break;
      case 'darwin':
        this.installer = new DarwinInstaller(this);
        break;
      case 'freebsd':
        this.installer = new FreeBSDInstaller(this);
        break;
      default:
        this.logger(`ERROR: This command is not supported on ${platform()}.`, 'fail');
        process.exit(1);
    }
  }

  private cli(): void {
    // Create the main program
    program
      .allowUnknownOption()
      .storeOptionsAsProperties(true)
      .name('cameraui')
      .description('camera.ui service manager')
      .option('-H, --home-path <path>', 'The directory where camera.ui will store its data', (p) => (this.homePath = p), join(this.getUserHomeDir(), '.camera.ui'))
      .option('-S, --service-name <service name>', 'The name of the camera.ui service to install or control', (p) => (this.serviceName = p), 'cameraui')
      .option('--user <user>', 'The user account the camera.ui service will be installed as (Linux, FreeBSD, macOS only)', (p) => (this.asUser = p))
      .option('--allow-root', 'Allow the cameraui run command to be executed as root', () => (this.allowRunRoot = true), false)
      .option('--worker', 'Run camera.ui in worker mode', () => (this.worker = true), false)
      .option('--docker', 'Run camera.ui in a Docker container', () => (this.docker = true), false)
      .option('--group <group>', 'The group the camera.ui service will be added to (Linux, FreeBSD, macOS only)', (p) => (this.addGroup = p))
      .option('--uid <number>', '', (i) => (this.uid = parseInt(i, 10)))
      .option('--gid <number>', '', (i) => (this.gid = parseInt(i, 10)))
      .option('-v, --version', 'Output the version number', () => this.showVersion());

    // Define individual commands
    program
      .command('install')
      .description('Install camera.ui as a service')
      .action(() => {
        this.action = 'install';
      });

    program
      .command('uninstall')
      .description('Remove the camera.ui service')
      .action(() => {
        this.action = 'uninstall';
      });

    program
      .command('reinstall')
      .description('Reinstall the camera.ui service')
      .action(() => {
        this.action = 'reinstall';
      });

    program
      .command('start')
      .description('Start the camera.ui service')
      .action(() => {
        this.action = 'start';
      });

    program
      .command('stop')
      .description('Stop the camera.ui service')
      .action(() => {
        this.action = 'stop';
      });

    program
      .command('restart')
      .description('Restart the camera.ui service')
      .action(() => {
        this.action = 'restart';
      });

    program
      .command('run')
      .description('Run camera.ui daemon')
      .action(() => {
        this.action = 'run';
      });

    program
      .command('logs')
      .description('Tails the camera.ui service logs')
      .action(() => {
        this.action = 'logs';
      });

    program
      .command('status')
      .description('Check the status of the camera.ui service')
      .action(() => {
        this.action = 'status';
      });

    program
      .command('before-start')
      .description('Perform actions before starting the service')
      .action(() => {
        this.action = 'before-start';
      });

    // Fix for the update-server command - add explicit version parameter
    program
      .command('update-server [version]')
      .description('Update the camera.ui server to the latest version or a specific version')
      .action((version) => {
        this.action = 'update-server';
        this.updateVersion = version; // Store version in a class property
      });

    // Parse arguments
    program.parse(process.argv);

    // If no command was recognized, default to help
    if (!this.action) {
      program.outputHelp();
      this.programUsage();
      process.exit(1);
    }
  }

  private setEnv(): void {
    if (this.docker) {
      process.env.CAMERA_UI_RUNMODE = 'docker';
    }

    if (!/^[a-z0-9-]+$/i.exec(this.serviceName)) {
      this.logger(`ERROR: Service name must not contain spaces or special characters: ${this.serviceName}`, 'fail');
      process.exit(1);
    }

    if (!this.homePath) {
      if (IS_DEV) {
        this.homePath = join(__dirname, '..', '..', '..', '..', '.camera.ui');
      } else {
        this.homePath = join(this.getUserHomeDir(), '.camera.ui');
      }
    } else {
      this.homePath = resolve(this.homePath);
    }

    this.storagePath = join(this.homePath, 'volume');
  }

  private runAction(): void {
    switch (this.action) {
      case 'install': {
        this.nvmCheck();
        this.logger(`Installing ${this.serviceName} service...`, 'info');
        this.installer.install();
        break;
      }
      case 'uninstall': {
        this.logger(`Removing ${this.serviceName} service...`, 'info');
        this.installer.uninstall();
        break;
      }
      case 'reinstall': {
        this.nvmCheck();
        this.logger(`Reinstalling ${this.serviceName} service...`, 'info');
        this.installer.reinstall();
        break;
      }
      case 'start': {
        this.logger(`Starting ${this.serviceName} service...`, 'info');
        this.installer.start();
        break;
      }
      case 'stop': {
        this.logger(`Stopping ${this.serviceName} service...`, 'info');
        this.installer.stop();
        break;
      }
      case 'restart': {
        this.logger(`Restarting ${this.serviceName} service...`, 'info');
        this.installer.restart();
        break;
      }
      case 'run': {
        this.logger('Running camera.ui daemon...', 'info');
        this.launch();
        break;
      }
      case 'logs': {
        this.tailLogs();
        break;
      }
      case 'update-server': {
        this.serverManager.update(this.updateVersion, true);
        break;
      }
      case 'before-start': {
        this.installer.beforeStart();
        break;
      }
      case 'status': {
        this.statusCheck();
        break;
      }
      default: {
        program.outputHelp();
        this.programUsage();
        process.exit(1);
      }
    }
  }

  private nvmCheck(): void {
    if (process.execPath.includes('nvm') && platform() === 'linux') {
      // prettier-ignore
      this.logger(
        'WARNING: It looks like you are running Node.js via NVM (Node Version Manager).\n' +
        '  Using cameraui service with NVM may not work unless you have configured NVM for the\n' +
        '  user this service will run as',
        'warn',
      );
    }
  }

  private async launch(): Promise<void> {
    if (platform() !== 'win32' && process.getuid?.() === 0 && !this.allowRunRoot) {
      this.logger('The cameraui run command should not be executed as root.', 'warn');
      this.logger('Use the --allow-root flag to force the service to run as the root user.', 'warn');
      process.exit(0);
    }

    try {
      await this.homePathCheck();
      this.logging.init();
      await this.serverManager.ensureInstalled();
    } catch (e) {
      this.logger(e.message, 'fail');
      process.exit(1);
    }

    this.signalHandler = new SignalHandler({
      displayName: '[Signal]',
      timeoutDuration: 10000,
      logger: {
        log: (...args) => this.logger(args.join(' '), 'info'),
        warn: (...args) => this.logger(args.join(' '), 'warn'),
        error: (...args) => this.logger(args.join(' '), 'fail'),
        success: (...args) => this.logger(args.join(' '), 'succeed'),
        debug: (...args) => this.logger(args.join(' '), 'debug'),
        trace: (...args) => this.logger(args.join(' '), 'debug'),
        attention: (...args) => this.logger(args.join(' '), 'warn'),
      },
      onSIGUSR2: () => (this.shuttingDownNodemon = true),
      closeFunction: this.stop.bind(this),
    });

    if (this.isDocker) {
      this.fixDockerPermissions();
    }

    if (cpus().length === 1 && arch() === 'arm') {
      this.logger('Delaying camera.ui startup by 20 seconds on low powered server', 'warn');
      await sleep(20000);
      this.run();
    } else {
      this.run();
    }
  }

  private run(): void {
    this.lastStartTime = Date.now();
    this.serverManager.start(this.handleClose.bind(this)).catch((error) => {
      this.logger(`Failed to start server: ${error.message}`, 'fail');
      process.exit(1);
    });
  }

  private async stop(): Promise<void> {
    await this.serverManager.stop();
    this.logging.close();
  }

  private async tailLogs(): Promise<void> {
    if (!existsSync(this.logPath)) {
      this.logger(`ERROR: Log file does not exist at expected location: ${this.logPath}`, 'fail');
      process.exit(1);
    }

    const logStats = await stat(this.logPath);
    const logStartPosition = logStats.size <= 200000 ? 0 : logStats.size - 200000;
    const logStream = createReadStream(this.logPath, { start: logStartPosition });

    logStream.on('data', (buffer) => {
      process.stdout.write(buffer);
    });

    logStream.on('end', () => {
      logStream.close();
    });

    const tail = new Tail(this.logPath, {
      fromBeginning: false,
      useWatchFile: true,
      fsWatchOptions: {
        interval: 100,
      },
    });

    tail.on('line', console.log);
  }

  private async statusCheck(): Promise<void> {
    this.logger(`Check if camera.ui is running on port ${this.uiPort}...`, 'info');

    try {
      await this.fetchApiHealth();
      this.logger('camera.ui running', 'succeed');
      await this.printPostInstallInstructions('status');
    } catch {
      this.logger('camera.ui not running!', 'fail');
      process.exit(1);
    }
  }

  private fetchApiHealth(): Promise<boolean> {
    return new Promise<boolean>((_resolve, _reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: this.uiPort,
        path: '/api/health',
        method: 'GET',
        rejectUnauthorized: false,
      };

      const req = request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            _reject(new Error(`Failed to fetch API health: ${res.statusCode}`));
          }

          try {
            const jsonData = JSON.parse(data);
            if (jsonData?.status === 'ok') {
              _resolve(true);
            } else {
              _resolve(false);
            }
          } catch (error) {
            _reject(error);
          }
        });
      });

      req.on('error', (error) => {
        _reject(error);
      });

      req.end();
    });
  }

  private showVersion(): void {
    const pjson = readJsonSync(join(__dirname, '..', 'package.json'));
    console.log('v' + pjson.version);
    process.exit(0);
  }

  private programUsage(): void {
    console.log('\r\nPlease provide a command:');
    console.log('    install                          install camera.ui as a service');
    console.log('    uninstall                        remove the camera.ui service');
    console.log('    reinstall                        reinstall the camera.ui service');
    console.log('    start                            start the camera.ui service');
    console.log('    stop                             stop the camera.ui service');
    console.log('    restart                          restart the camera.ui service');
    console.log('    run                              run camera.ui daemon');
    console.log('    logs                             tails the camera.ui service logs');
    console.log('    status                           check the status of the camera.ui service');
    console.log('    update-server [version]          update the camera.ui server to the latest version or a specific version');
  }

  private async storagePathCheck(): Promise<void> {
    if (!(await pathExists(this.storagePath))) {
      this.logger(`Creating camera.ui storage directory: ${this.storagePath}`, 'info');
      await mkdirp(this.storagePath);
      await this.chownPath(this.storagePath);
    }
  }

  private fixDockerPermissions(): void {
    if (this.uid !== undefined && this.gid !== undefined) {
      try {
        execSync(`chown -R ${this.uid}:${this.gid} "${this.homePath}"`);
      } catch {
        // do nothing
      }

      try {
        execSync(`chown -R ${this.uid}:${this.gid} "${this.storagePath}"`);
      } catch {
        // do nothing
      }
    }

    try {
      execSync('$(which sysctl) -w net.core.rmem_default=5242880');
      execSync('$(which sysctl) -w net.core.rmem_max=5242880');
    } catch {
      this.logger('Docker container must be run with --privileged flag to set sysctl values', 'warn');
    }
  }

  private async staleProcessCheck(): Promise<void> {
    if (platform() === 'win32') {
      return;
    }

    try {
      const uiPort = this.uiPort;

      // check if port is still in use
      if (!(await isPortInUse(uiPort))) {
        return;
      }

      // find the pid of the process using the port
      const pid = this.installer.getPidOfPort(uiPort);
      if (!pid) {
        return;
      }

      // kill the stale camera.ui process
      this.logger(`Found stale camera.ui process running on port ${uiPort} with PID ${pid}, killing...`, 'warn');
      process.kill(parseInt(pid, 10), 'SIGKILL');
    } catch {
      // do nothing
    }
  }

  private handleClose(code: number | null, signal: NodeJS.Signals | null): void {
    this.logger(`camera.ui Process Ended. Code: ${code}, Signal: ${signal}, Restarting: ${!this.abortRestart}`, 'info');

    this.staleProcessCheck();

    if (this.abortRestart || this.shuttingDown) {
      return;
    }

    if (Date.now() - this.lastStartTime > this.STABLE_RUN_MS) {
      this.restartAttempts = 0;
    }

    if (this.restartAttempts >= this.MAX_RESTART_ATTEMPTS) {
      this.logger(`camera.ui keeps exiting — gave up after ${this.restartAttempts} restarts; letting the service manager take over`, 'fail');
      process.exit(1);
    }

    this.restartAttempts++;
    const delay = Math.min(this.BASE_RESTART_DELAY * 2 ** (this.restartAttempts - 1), this.MAX_RESTART_DELAY);

    clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (!this.shuttingDown && !this.abortRestart) {
        this.logger(`Restarting camera.ui (attempt ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS})...`, 'info');
        this.run();
      }
    }, delay);
  }
}

function launch() {
  return new CameraUiCLI();
}

launch();
