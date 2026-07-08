import { sleep } from '@camera.ui/common/utils';
import { API_EVENT } from '@camera.ui/sdk';
import { strip } from 'ansicolor';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { container } from 'tsyringe';

import { RUNTIME_STATUS } from '../services/config/types.js';
import { isShuttingDown } from '../shutdown-state.js';

import type { Logger } from '@camera.ui/common/logger';
import type { ChildProcess } from 'node:child_process';
import type { Interface } from 'node:readline';
import type { CameraUiAPI } from '../api.js';
import type { SocketService } from '../api/websocket/index.js';
import type { ServerRuntime } from '../api/websocket/types.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';

export class Go2Rtc {
  public version = 'unknown';
  public os = 'unknown';

  private go2rtcProcess?: ChildProcess;

  private api: CameraUiAPI;
  private logger: Logger;
  private configService: ConfigService;

  private started = false;
  private hasEverStarted = false; // True after first successful start, never resets
  private restarting = false;
  private manuallyKilled = false;
  private shuttingDown = false;

  private stdoutLine?: Interface;
  private stderrLine?: Interface;

  private _status: RUNTIME_STATUS = RUNTIME_STATUS.UNKNOWN;

  public get status(): RUNTIME_STATUS {
    return this._status;
  }

  constructor() {
    container.registerInstance('go2rtc', this);

    this.api = container.resolve<CameraUiAPI>('api');
    this.configService = container.resolve<ConfigService>('configService');
    const loggerService = container.resolve<LoggerService>('logger');

    this.logger = loggerService.createSystemLogger('Go2RTC', 'go2rtc');
    this.logger.debugEnabled = this.configService.go2rtcLoggerOptions.debugEnabled ?? false;
    this.logger.traceEnabled = this.configService.go2rtcLoggerOptions.traceEnabled ?? false;

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.shuttingDown = true;
      this.stop();
    });
  }

  public async start(): Promise<void> {
    if (this.started) {
      this.logger.warn('Go2RTC already running!');
      return;
    }

    const command = this.configService.GO2RTC_BINARY;
    const args = ['-config', this.configService.GO2RTC_CONFIG_FILE];

    this.logger.debug(`Starting go2rtc with following command: ${command} ${args.join(' ')}`);

    this.started = true;
    this.manuallyKilled = false;
    this.setStatus(RUNTIME_STATUS.STARTING);

    return new Promise((resolve, reject) => {
      this.go2rtcProcess = spawn(command, args, {
        env: Object.assign({}, process.env),
        cwd: '.',
        stdio: 'pipe',
        windowsHide: true,
      });

      let go2rtcPID: number | undefined = undefined;

      this.go2rtcProcess.on('spawn', async () => {
        this.logger.log(`Initializing process with PID: ${this.go2rtcProcess?.pid}`);

        go2rtcPID = this.go2rtcProcess?.pid;

        if (go2rtcPID) {
          this.configService.addProcess({
            pid: go2rtcPID,
            startTime: Date.now(),
            command,
            args,
          });
        }

        await sleep(1000);

        this.setStatus(RUNTIME_STATUS.STARTED);

        resolve();
      });

      this.go2rtcProcess.on('error', (error: Error) => {
        this.started = false;

        this.logger.error('The go2rtc process failed to start/stop!', error);

        this.setStatus(RUNTIME_STATUS.ERROR);

        reject(error);
      });

      this.go2rtcProcess.on('exit', async () => {
        this.configService.removeProcessByPID(go2rtcPID);

        setTimeout(() => {
          this.started = false;

          this.setStatus(RUNTIME_STATUS.STOPPED);
          this.handleClose();

          resolve();
        }, 100);
      });

      this.stdoutLine = createInterface({
        input: this.go2rtcProcess.stdout!,
        terminal: false,
      });

      this.stderrLine = createInterface({
        input: this.go2rtcProcess.stderr!,
        terminal: false,
      });

      this.stdoutLine.on('line', this.processLogger.bind(this));
      this.stderrLine.on('line', this.processLogger.bind(this));
    });
  }

  public async stop(): Promise<void> {
    this.logger.log('Stopping go2rtc...');
    this.manuallyKilled = true;
    this.stdoutLine?.close();
    this.stderrLine?.close();
    await this.kill();
  }

  public async restart(): Promise<void> {
    this.restarting = true;

    await this.stop();
    await sleep(1000);
    await this.start();
  }

  public getPID(): number {
    return this.go2rtcProcess?.pid ?? 0;
  }

  private async kill(): Promise<void> {
    return new Promise((resolve) => {
      const res = (): void => {
        clearTimeout(killTimeout);
        resolve();
      };

      this.go2rtcProcess?.once('exit', () => {
        res();
      });

      this.go2rtcProcess?.kill('SIGKILL');

      const killTimeout = setTimeout(() => res(), 3000);
    });
  }

  private handleClose(): void {
    if (!this.shuttingDown && !this.manuallyKilled && !isShuttingDown()) {
      this.logger.log('Restarting go2rtc in 5s...');

      setTimeout(() => {
        if (this.shuttingDown || this.manuallyKilled || isShuttingDown()) {
          this.logger.log('Cancelled restart!');
          return;
        }

        this.start();
      }, 5000);
    }
  }

  private async handleRestart(): Promise<void> {
    try {
      await this.configService.mergeGo2RtcConfig();
      this.updateLoggerOptions();

      this.logger.debug('Go2RTC restart handled successfully');
    } catch (error) {
      this.logger.error('Failed to handle go2rtc restart', error);
    } finally {
      this.restarting = false;
    }
  }

  private updateLoggerOptions(): void {
    const options = this.configService.go2rtcLoggerOptions;
    this.logger.debugEnabled = options.debugEnabled ?? false;
    this.logger.traceEnabled = options.traceEnabled ?? false;
  }

  private setStatus(status: RUNTIME_STATUS): void {
    this._status = status;

    const socketService = container.resolve<SocketService>('socketService');

    const runtimeInfo: ServerRuntime = {
      go2rtc: { name: 'go2rtc', status: status },
    };

    socketService.io?.of('/status').emit('process-status', runtimeInfo);
  }

  private processLogger(line: string): void {
    const blankLine = strip(line.replace(/([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(:|\.)\d{3} /, ''));

    if (this.isIgnorableString(blankLine)) {
      return;
    }

    if (this.isTraceableString(blankLine)) {
      this.logger.trace(blankLine);
      return;
    }

    if (blankLine.includes('WRN')) {
      this.logger.warn(blankLine);
    } else if (
      blankLine.includes('FTL') ||
      blankLine.includes('ERR') ||
      blankLine.startsWith('panic') ||
      (!blankLine.includes('DBG') && blankLine.toLowerCase().includes('error'))
    ) {
      this.logger.error(blankLine);
    } else if (blankLine.includes('DBG')) {
      this.logger.debug(blankLine);
    } else {
      this.logger.log(blankLine);
    }

    if (this.version === 'unknown') {
      const versionPattern = /version=([^\s]+)/;
      const revisionPattern = /revision=([^\s]+)/;
      const versionMatch = versionPattern.exec(blankLine);
      const revisionMatch = revisionPattern.exec(blankLine);

      if (versionMatch && revisionMatch) {
        this.version = `${versionMatch[1]} (${revisionMatch[1]})`;
      }
    }

    if (this.os === 'unknown') {
      const platformPattern = /platform=([^\s]+)/;
      const platformMatch = platformPattern.exec(blankLine);

      if (platformMatch) {
        this.os = platformMatch[1];
      }
    }

    if (blankLine.includes('listen addr=')) {
      const go2rtcAdress = blankLine.split('listen addr=')[1];
      let go2rtcModule: string | undefined;

      if (blankLine.includes('[api]')) {
        if (!this.hasEverStarted) {
          this.hasEverStarted = true;
        } else {
          // Restart detected (via go2rtc UI, camera.ui, or manual kill) — refresh config + logger
          this.handleRestart();
        }

        this.started = true;
        go2rtcModule = 'api';
      }

      if (blankLine.includes('[rtsp]')) {
        go2rtcModule = 'rtsp';
      }

      if (blankLine.includes('[webrtc]')) {
        go2rtcModule = 'webrtc';
      }

      if (blankLine.includes('[rtmp]')) {
        go2rtcModule = 'rtmp';
      }

      if (blankLine.includes('[srtp]')) {
        go2rtcModule = 'srtp';
      }

      if (go2rtcAdress && go2rtcModule) {
        this.logger.log(`go2rtc v${this.version} (${this.os}) is listening on ${go2rtcAdress} (${go2rtcModule})`);

        if (go2rtcModule === 'api') {
          // srtp is not logged through go2rtc, log manually
          this.logger.log(`go2rtc v${this.version} (${this.os}) is listening on ${this.configService.go2rtcConfig.srtp.listen} (srtp)`);
        }
      }
    }
  }

  private isIgnorableString(line: string): boolean {
    switch (true) {
      case line.includes('decode_slice_header'):
      case line.includes('Last message repeated'):
      case line.includes('non-existing PPS 0 referenced'):
      case line.includes('no frame'):
      case line.includes('Error muxing a packet'):
      case line.includes('av_interleaved_write_frame'):
      case line.includes('Error writing trailer: Broken pipe'):
      case line.includes('TLS handshake error from'):
      case line.includes('[mjpeg] transcoding time'):
      case line.includes('streams: codecs not matched') && line.includes('=> audio:ANY'): // no audio
        return true;
      default:
        return false;
    }
  }

  private isTraceableString(line: string): boolean {
    switch (true) {
      case line.includes('Error opening input files: Server returned 404 Not Found'): // no audio (+h265?)
      case line.includes('Error opening input: Server returned 404 Not Found'): // no audio
      case line.includes('Error opening input file') && decodeURIComponent(line).includes('#cameraui'):
      case line.includes('can\'t add track error="webrtc: can\'t get track"'):
      case line.includes('/aac') && line.includes('Error submitting packet to decoder: Invalid data found when processing input'):
        return true;
      default:
        return false;
    }
  }
}
