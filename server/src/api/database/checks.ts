import { isProcessRunning } from '@camera.ui/common/node';
import fkill from 'fkill';
import { open } from 'lmdb';
import { constants, existsSync } from 'node:fs';
import { access, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import psList from 'ps-list';
import { container } from 'tsyringe';

import type { ConfigService } from '../../services/config/index.js';

export interface PathExistenceResult {
  path: string;
  exists: boolean;
}

export interface PathPermissionsResult {
  path: string;
  hasPermissions: boolean;
  error?: Error;
}

export interface CleanedUpFilesResult {
  path: string;
  wasCleaned: boolean;
  error?: Error;
}

export interface DatabaseCorruptionResult {
  dbPath: string;
  isCorrupt: boolean;
  error?: Error;
}

export interface PortAvailabilityResult {
  port: number;
  isAvailable: boolean;
}

export interface OrphanedProcessesResult {
  processInfo: ProcInfo;
  killed?: boolean;
  wasOrphaned?: boolean;
  error?: Error;
}

export interface PathPermission {
  path: string;
  mode: number;
}

export interface ProcInfo {
  pid: number;
  startTime: number;
  command: string;
  args: string[];
  titles?: string[];
  uniqueId?: string;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      server.close();
      resolve(err.code !== 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function isOwnProcess(processInfo: ProcInfo): Promise<boolean> {
  const processes = await psList();
  const proc = processes.find((p) => p.pid === processInfo.pid);

  if (!proc) {
    return false;
  }

  const isCommandMatch = Boolean(proc.name === processInfo.command || proc.cmd?.includes(processInfo.command));
  const areArgsMatch = processInfo.args.every((arg) => proc.cmd?.includes(arg));
  const idMatch = Boolean(processInfo.uniqueId ? proc.cmd?.includes(processInfo.uniqueId) : false);
  const titleMatch = Boolean(processInfo.titles ? processInfo.titles.some((title) => proc.name?.includes(title) || proc.cmd?.includes(title)) : false);

  if (idMatch || titleMatch || (isCommandMatch && areArgsMatch)) {
    return true;
  }

  return false;
}

export async function checkPathsExist(pathsToCheck: string[]): Promise<PathExistenceResult[]> {
  const results: PathExistenceResult[] = [];

  for (const path of pathsToCheck) {
    const exists = existsSync(path);
    results.push({ path, exists });
  }

  return results;
}

export async function checkPathPermissions(pathsWithPermissionsToCheck: PathPermission[]): Promise<PathPermissionsResult[]> {
  const results: PathPermissionsResult[] = [];

  for (const { path, mode } of pathsWithPermissionsToCheck) {
    try {
      await access(path, mode);
      results.push({ path, hasPermissions: true });
    } catch (err) {
      results.push({ path, hasPermissions: false, error: err as Error });
    }
  }

  return results;
}

export async function cleanUpFiles(filesToClean: string[]): Promise<CleanedUpFilesResult[]> {
  const cleanedFiles: CleanedUpFilesResult[] = [];

  for (const file of filesToClean) {
    try {
      await access(file, constants.W_OK);
      await unlink(file);

      cleanedFiles.push({ path: file, wasCleaned: true });
    } catch (err) {
      cleanedFiles.push({ path: file, wasCleaned: false, error: err as Error });
    }
  }

  return cleanedFiles;
}

export async function checkDatabaseCorruption(dbPath: string): Promise<DatabaseCorruptionResult> {
  try {
    const db = open({
      path: dbPath,
      readOnly: true,
    });

    await db.get('test_key');
    await db.close();

    return { dbPath, isCorrupt: false };
  } catch (err) {
    return { dbPath, isCorrupt: true, error: err as Error };
  }
}

export async function checkPortAvailability(portsToCheck: number[]): Promise<PortAvailabilityResult[]> {
  const results: PortAvailabilityResult[] = [];

  for (const port of portsToCheck) {
    const isAvailable = await isPortAvailable(port);
    results.push({ port, isAvailable });
  }

  return results;
}

export async function checkOrphanedProcesses(processInfos: ProcInfo[]): Promise<OrphanedProcessesResult[]> {
  const configService = container.resolve<ConfigService>('configService');
  const results: OrphanedProcessesResult[] = [];

  for (const processInfo of processInfos) {
    try {
      const isRunning = isProcessRunning(processInfo.pid);
      if (isRunning) {
        const isOwnProc = await isOwnProcess(processInfo);
        if (isOwnProc) {
          const info: OrphanedProcessesResult = {
            processInfo,
            wasOrphaned: true,
          };

          try {
            await fkill(processInfo.pid, { force: true });
            info.killed = true;
          } catch (error) {
            info.killed = false;
            info.error = error as Error;
          }

          results.push(info);
        } else {
          results.push({ processInfo, wasOrphaned: false });
          configService.removeProcessByPID(processInfo.pid);
        }
      } else {
        results.push({ processInfo, wasOrphaned: false });
        configService.removeProcessByPID(processInfo.pid);
      }
    } catch (err) {
      results.push({ processInfo, error: err as Error });
    }
  }

  return results;
}
