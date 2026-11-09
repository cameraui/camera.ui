import { Logger } from '@camera.ui/common';
import { MAIN_LOG_SIZE, rotateFullLogFile } from '@camera.ui/common/node';
import { appendFileSync } from 'node:fs';

import { printSymbol } from './spinner.js';

export class CLILogger {
  private logger: Logger;
  private writing = false;

  constructor(
    private logPath: string,
    private action = '',
  ) {
    this.logger = new Logger({ prefix: 'camera.ui', suffix: 'CLI', debugEnabled: true, traceEnabled: true });
  }

  public init(): void {
    this.writing = true;

    this.logger.onLog((entry) => {
      if (!this.writing) return;

      try {
        // open, append, close: the server rotates this file, no handle may stay on the old one
        appendFileSync(this.logPath, Logger.formatAsText(entry) + '\n');
      } catch {
        // a full disk must not stop the launcher
      }
    });
  }

  public async rotate(): Promise<void> {
    try {
      const rotation = await rotateFullLogFile(this.logPath, MAIN_LOG_SIZE);
      if (rotation && !rotation.rotated) this.log(`Could not rotate the log file (${rotation.error}), cut it in place instead`, 'warn');
    } catch (error) {
      this.log(`Could not shorten the log file: ${error.message}`, 'fail');
    }
  }

  public log(msg: string, level: 'info' | 'succeed' | 'fail' | 'warn' | 'debug' | 'raw' = 'info', write?: boolean): void {
    if (this.action === 'run' || write) {
      if (level === 'raw') {
        // server output, its FileTransport already writes it to the same file
        console.log(msg);
      } else {
        const loggingLevel = this.getLoggingLevel(level);
        this.logger[loggingLevel](msg);
      }
    } else {
      printSymbol(level === 'debug' || level === 'raw' ? 'info' : level, msg);
    }
  }

  public close(): void {
    this.writing = false;
  }

  private getLoggingLevel(level: 'info' | 'succeed' | 'fail' | 'warn' | 'debug' | 'raw'): 'log' | 'warn' | 'error' | 'success' | 'debug' | 'raw' {
    switch (level) {
      case 'info':
        return 'log';
      case 'succeed':
        return 'success';
      case 'fail':
        return 'error';
      case 'warn':
        return 'warn';
      case 'debug':
        return 'debug';
      case 'raw':
        return 'raw';
      default:
        return 'log';
    }
  }
}
