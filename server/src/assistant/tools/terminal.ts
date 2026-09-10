import { toolDefinition } from '@tanstack/ai';
import { spawn } from 'node:child_process';
import * as zod from 'zod';

import { approvalSchema, toolError } from './shared.js';

import type { CoreTool, CoreToolMetadata, ToolContext } from './shared.js';

const OUTPUT_MAX_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_S = 30;
const MAX_TIMEOUT_S = 120;
const KILL_GRACE_MS = 2_000;
const ENV_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'TZ', 'USER', 'SystemRoot', 'COMSPEC'];

const runCommandInput = zod.object({
  command: zod.string().min(1).max(2000).describe('The shell command line, executed by the system shell'),
  cwd: zod.string().min(1).max(500).optional().describe('Working directory, default: the server directory'),
  timeoutSeconds: zod.number().int().min(1).max(MAX_TIMEOUT_S).optional().describe(`Kill the command after this many seconds, default ${DEFAULT_TIMEOUT_S}`),
});

const runCommand = toolDefinition({
  name: 'run_command',
  description:
    'Run one shell command on the server that hosts camera.ui and return its output and exit code. For host diagnostics the other tools cannot ' +
    'answer: disk usage, network reachability of a camera, processes, container logs. One command per call, no interactive programs. ' +
    'The user sees the exact command and confirms it before it runs.',
  needsApproval: true,
  inputSchema: approvalSchema(runCommandInput),
  metadata: { adminOnly: true, group: 'terminal', chatOnly: true } satisfies CoreToolMetadata,
}).server<ToolContext['context']>(async (args) => {
  const parsed = runCommandInput.safeParse(args);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  const { command, cwd, timeoutSeconds } = parsed.data;
  return execute(command, cwd, (timeoutSeconds ?? DEFAULT_TIMEOUT_S) * 1000);
});

function execute(command: string, cwd: string | undefined, timeoutMs: number): Promise<Record<string, unknown>> {
  const started = Date.now();
  const [shell, flags] = process.platform === 'win32' ? [process.env.COMSPEC ?? 'cmd.exe', ['/d', '/s', '/c']] : [process.env.SHELL ?? '/bin/sh', ['-c']];
  const env: Record<string, string> = {};
  for (const key of ENV_KEYS) if (process.env[key]) env[key] = process.env[key]!;

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(shell, [...flags, command], { cwd: cwd ?? process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error: any) {
      resolve(toolError(`Could not start the shell: ${error.message}`));
      return;
    }
    const out = new Collector();
    const err = new Collector();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve(toolError(`Could not run the command: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        signal: signal ?? undefined,
        timedOut,
        durationMs: Date.now() - started,
        stdout: out.text(),
        stderr: err.text(),
        truncated: out.truncated || err.truncated || undefined,
      });
    });
  });
}

class Collector {
  public truncated = false;
  private chunks: Buffer[] = [];
  private size = 0;

  public push(chunk: Buffer): void {
    if (this.size >= OUTPUT_MAX_BYTES) {
      this.truncated = true;
      return;
    }
    const room = OUTPUT_MAX_BYTES - this.size;
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.size += room;
      this.truncated = true;
      return;
    }
    this.chunks.push(chunk);
    this.size += chunk.length;
  }

  public text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

export const terminalTools: CoreTool[] = [runCommand];
