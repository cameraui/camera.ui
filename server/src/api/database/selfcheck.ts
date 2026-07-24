import { PromiseTimeout } from '@camera.ui/common/utils';
import { green } from 'ansicolor';
import { dump as yamlDump } from 'js-yaml';
import { constants, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { FatalBootError } from '../../utils/ipc.js';
import { checkDatabaseCorruption, checkOrphanedProcesses, checkPathPermissions, checkPathsExist, checkPortAvailability, cleanUpFiles } from './checks.js';

import type { LoggerService } from '../../services/logger/index.js';
import type {
  CleanedUpFilesResult,
  DatabaseCorruptionResult,
  OrphanedProcessesResult,
  PathExistenceResult,
  PathPermission,
  PathPermissionsResult,
  PortAvailabilityResult,
} from './checks.js';

const CHECK_TIMEOUT_MS = 15_000;

interface SelfCheckResults {
  pathsExistence?: PathExistenceResult[];
  pathsPermissions?: PathPermissionsResult[];
  cleanedUpFiles?: CleanedUpFilesResult[];
  databaseCorruption?: DatabaseCorruptionResult;
  portAvailability?: PortAvailabilityResult[];
  orphanedProcesses?: OrphanedProcessesResult[];
}

interface IssueReport {
  type: string;
  message: string;
  details?: unknown;
}

function serializeErrors(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) {
    return value.map(serializeErrors);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, serializeErrors(val)]));
  }
  return value;
}

export class SelfCheck {
  private logger: LoggerService;
  private configService: ConfigService;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
  }

  public async run(): Promise<void> {
    this.logger.log('Running self-checks...');

    const checkResults = await this.performChecks();
    const criticalIssues = this.checkForCriticalIssues(checkResults);
    const nonCriticalIssues = this.checkForNonCriticalIssues(checkResults);

    const reportPath = await this.saveCheckReport(checkResults, criticalIssues, nonCriticalIssues);

    if (criticalIssues.length > 0) {
      const summary = criticalIssues.map((issue) => `  - ${issue.message}`).join('\n');
      const report = [
        'Self-check found critical issues — camera.ui cannot start safely:',
        summary,
        '',
        `A diagnostic report was saved to ${reportPath} — please attach it when reporting this issue.`,
      ].join('\n');

      this.logger.error(report);

      throw new FatalBootError(report);
    }

    if (nonCriticalIssues.length > 0) {
      this.logger.warn(`Self-check passed with non-critical warnings — see the report at ${reportPath}`);
    } else {
      this.logger.log(green('Self-check passed successfully!'));
    }
  }

  private async performChecks(): Promise<SelfCheckResults> {
    const pathsToCheck = [
      this.configService.HOME_PATH,
      this.configService.STORAGE_PATH,
      this.configService.LOGS_PATH,
      this.configService.PIDS_FILE,
      this.configService.DATABASE_PATH,
      this.configService.USERS_STORAGE_PATH,
      this.configService.TMP_PATH,
      this.configService.REPORTS_FILE,
      this.configService.PLUGINS_STORAGE_PATH,
      this.configService.PLUGINS_INSTALL_PATH,
      this.configService.LOG_FILE,
      this.configService.CONFIG_FILE,
      this.configService.SECRETS_FILE,
      this.configService.GO2RTC_BINARY,
      this.configService.GO2RTC_CONFIG_FILE,
      this.configService.TUNNEL_BINARY,
      this.configService.NATS_BINARY,
    ];

    const pathsWithPermissionsToCheck: PathPermission[] = [
      { path: this.configService.GO2RTC_BINARY, mode: constants.X_OK },
      { path: this.configService.TUNNEL_BINARY, mode: constants.X_OK },
      { path: this.configService.NATS_BINARY, mode: constants.X_OK },
      { path: this.configService.CONFIG_FILE, mode: constants.R_OK | constants.W_OK },
      { path: this.configService.GO2RTC_CONFIG_FILE, mode: constants.R_OK | constants.W_OK },
      { path: this.configService.SECRETS_FILE, mode: constants.R_OK | constants.W_OK },
      { path: this.configService.LOG_FILE, mode: constants.R_OK | constants.W_OK },
      { path: this.configService.DATABASE_PATH, mode: constants.R_OK | constants.W_OK },
      { path: this.configService.HOME_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.STORAGE_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.LOGS_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.USERS_STORAGE_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.TMP_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.PLUGINS_STORAGE_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.PLUGINS_INSTALL_PATH, mode: constants.R_OK | constants.W_OK | constants.X_OK },
      { path: this.configService.PIDS_FILE, mode: constants.R_OK | constants.W_OK },
    ];

    const ffmpegBin = this.configService.go2rtcConfig.ffmpeg.bin;
    if (ffmpegBin && isAbsolute(ffmpegBin)) {
      pathsToCheck.push(ffmpegBin);
      pathsWithPermissionsToCheck.push({ path: ffmpegBin, mode: constants.X_OK });
    }

    const portsToCheck = [
      this.configService.config.port,
      this.configService.go2rtcConfig.api.listen.split(':')[1],
      this.configService.go2rtcConfig.api.tls_listen.split(':')[1],
      this.configService.go2rtcConfig.rtsp.listen.split(':')[1],
      this.configService.go2rtcConfig.srtp.listen.split(':')[1],
      this.configService.go2rtcConfig.rtmp.listen.split(':')[1],
      this.configService.go2rtcConfig.webrtc.listen.split(':')[1],
    ]
      .filter((port) => port)
      .map((port) => parseInt(port as string, 10));

    const [pathsExistence, pathsPermissions, cleanedUpFiles, databaseCorruption, orphanedProcesses] = await Promise.all([
      this.runCheck('paths existence', () => checkPathsExist(pathsToCheck)),
      this.runCheck('paths permissions', () => checkPathPermissions(pathsWithPermissionsToCheck)),
      this.runCheck('cleanup files', () => cleanUpFiles([])),
      this.runCheck('database corruption', () => checkDatabaseCorruption(this.configService.DATABASE_PATH)),
      this.runCheck('orphaned processes', () => checkOrphanedProcesses(this.configService.processes)),
    ]);

    const portAvailability = await this.runCheck('port availability', () => checkPortAvailability(portsToCheck));

    return { pathsExistence, pathsPermissions, cleanedUpFiles, databaseCorruption, orphanedProcesses, portAvailability };
  }

  private async runCheck<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await PromiseTimeout(fn, CHECK_TIMEOUT_MS, undefined, `${label} timed out after ${CHECK_TIMEOUT_MS}ms`);
    } catch {
      return undefined;
    }
  }

  private checkForCriticalIssues(results: SelfCheckResults): IssueReport[] {
    const criticalIssues: IssueReport[] = [];

    if (results.databaseCorruption?.isCorrupt) {
      criticalIssues.push({ type: 'Database Corruption', message: 'Database corruption detected', details: results.databaseCorruption });
    }

    for (const result of results.pathsExistence ?? []) {
      if (!result.exists && this.isCriticalPath(result.path)) {
        criticalIssues.push({ type: 'Missing Critical Path', message: `Missing critical path: ${result.path}`, details: result });
      }
    }

    for (const result of results.pathsPermissions ?? []) {
      if (!result.hasPermissions && this.isCriticalPath(result.path)) {
        criticalIssues.push({ type: 'Insufficient Permissions', message: `Insufficient permissions for critical path: ${result.path}`, details: result });
      }
    }

    for (const result of results.portAvailability ?? []) {
      if (!result.isAvailable) {
        criticalIssues.push({ type: 'Port Unavailable', message: `Required port ${result.port} is not available`, details: result });
      }
    }

    return criticalIssues;
  }

  private checkForNonCriticalIssues(results: SelfCheckResults): IssueReport[] {
    const nonCriticalIssues: IssueReport[] = [];

    for (const result of results.pathsExistence ?? []) {
      if (!result.exists && !this.isCriticalPath(result.path)) {
        nonCriticalIssues.push({ type: 'Missing Non-Critical Path', message: `Missing non-critical path: ${result.path}`, details: result });
      }
    }

    for (const result of results.pathsPermissions ?? []) {
      if (!result.hasPermissions && !this.isCriticalPath(result.path)) {
        nonCriticalIssues.push({ type: 'Insufficient Permissions', message: `Insufficient permissions for non-critical path: ${result.path}`, details: result });
      }
    }

    for (const result of results.orphanedProcesses ?? []) {
      if (result.wasOrphaned) {
        nonCriticalIssues.push({
          type: 'Orphaned Process',
          message: `Orphaned process detected: ${result.processInfo.command} (PID: ${result.processInfo.pid})`,
          details: result,
        });
      }
    }

    return nonCriticalIssues;
  }

  private async saveCheckReport(checkResults: SelfCheckResults, criticalIssues: IssueReport[], nonCriticalIssues: IssueReport[]): Promise<string> {
    const reportPath = existsSync(this.configService.REPORTS_FILE) ? this.configService.REPORTS_FILE : join(homedir(), 'camera.ui.report.yaml');

    const report = serializeErrors({
      self_check_report: {
        environment: ConfigService.ENVIRONMENT,
        metadata: {
          status: criticalIssues.length ? 'error' : nonCriticalIssues.length ? 'warning' : 'success',
          timestamp: new Date().toISOString(),
        },
        critical_issues: criticalIssues,
        non_critical_issues: nonCriticalIssues,
        results: checkResults,
      },
    });

    await writeFile(reportPath, yamlDump(report, { indent: 2, lineWidth: -1 }));
    this.logger.log(`Detailed self-check report saved to: ${reportPath}`);

    return reportPath;
  }

  private isCriticalPath(path: string): boolean {
    const criticalPaths = [
      this.configService.HOME_PATH,
      this.configService.STORAGE_PATH,
      this.configService.PIDS_FILE,
      this.configService.DATABASE_PATH,
      this.configService.USERS_STORAGE_PATH,
      this.configService.PLUGINS_STORAGE_PATH,
      this.configService.PLUGINS_INSTALL_PATH,
      this.configService.LOG_FILE,
      this.configService.CONFIG_FILE,
      this.configService.SECRETS_FILE,
      this.configService.GO2RTC_BINARY,
      this.configService.GO2RTC_CONFIG_FILE,
      this.configService.TUNNEL_BINARY,
      this.configService.NATS_BINARY,
    ];

    return criticalPaths.includes(path);
  }
}
