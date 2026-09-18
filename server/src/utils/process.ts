import { execFile } from 'node:child_process';
import { readFile, readlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface ProcessSnapshot {
  name: string;
  cmd: string;
}

export interface KillOptions {
  silent?: boolean;
}

export async function killProcesses(pids: number[], options: KillOptions = {}): Promise<void> {
  const targets = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  const errors: string[] = [];

  await Promise.all(
    targets.map(async (pid) => {
      try {
        if (process.platform === 'win32') {
          // taskkill only reports a missing process in the system language, so ask first
          process.kill(pid, 0);
          // /T takes the children with it, which is what taskkill did through fkill
          await exec('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
        } else {
          process.kill(pid, 'SIGKILL');
        }
      } catch (error) {
        errors.push(`Killing process ${pid} failed: ${failureReason(error)}`);
      }
    }),
  );

  if (errors.length > 0 && !options.silent) {
    throw new AggregateError(errors, 'Failed to kill processes');
  }
}

export async function killProcess(pid: number, options: KillOptions = {}): Promise<void> {
  return killProcesses([pid], options);
}

export async function readProcessSnapshots(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const targets = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (targets.length === 0) {
    return new Map();
  }

  if (process.platform === 'linux') {
    return readFromProc(targets);
  }
  if (process.platform === 'win32') {
    return readFromWmi(targets);
  }

  return readFromPs(targets);
}

function failureReason(error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
    return "Process doesn't exist";
  }

  const stderr = (error as { stderr?: string }).stderr?.trim();
  if (stderr) {
    return stderr.replace(/^ERROR:\s*/i, '');
  }

  return error instanceof Error ? error.message : String(error);
}

function snapshot(command: string, fallbackName: string): ProcessSnapshot {
  const executable = command.split(' ')[0];
  return { name: executable ? basename(executable) : fallbackName, cmd: command };
}

async function readFromProc(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const snapshots = new Map<number, ProcessSnapshot>();

  await Promise.all(
    pids.map(async (pid) => {
      const comm = (await readFile(`/proc/${pid}/comm`, 'utf8').catch(() => '')).trim();
      if (!comm) {
        return;
      }

      const raw = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
      const cmd = raw.split('\0').filter(Boolean).join(' ').trim();
      // /proc/<pid>/exe is the real binary, comm is truncated to 15 characters
      const exe = await readlink(`/proc/${pid}/exe`).catch(() => '');
      const name = exe ? basename(exe.replace(/\s+\(deleted\)$/, '')) : comm;

      snapshots.set(pid, { name, cmd: cmd || comm });
    }),
  );

  return snapshots;
}

async function readFromPs(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const snapshots = new Map<number, ProcessSnapshot>();
  const { stdout } = await exec('ps', ['-o', 'pid=,args=', '-p', pids.join(',')]).catch((error) => {
    // ps exits non-zero when none of the pids exist
    if ((error as { stdout?: string }).stdout !== undefined) {
      return error as { stdout: string };
    }
    throw error;
  });

  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    snapshots.set(Number(match[1]), snapshot(match[2].trim(), ''));
  }

  return snapshots;
}

async function readFromWmi(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' or ');
  const { stdout } = await exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`,
    ],
    { windowsHide: true },
  );

  const snapshots = new Map<number, ProcessSnapshot>();
  const trimmed = stdout.trim();
  if (!trimmed) {
    return snapshots;
  }

  const parsed = JSON.parse(trimmed) as { ProcessId: number; Name?: string; CommandLine?: string } | { ProcessId: number; Name?: string; CommandLine?: string }[];
  for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
    snapshots.set(entry.ProcessId, { name: entry.Name ?? '', cmd: entry.CommandLine ?? '' });
  }

  return snapshots;
}
