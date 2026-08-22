export interface ExitContext {
  pid?: number;
  startTime?: number;
}

export function exitInfo(code: number | null, signal: NodeJS.Signals | null, context: ExitContext = {}): string {
  const parts = [`code: ${code ?? 'none'}`, `signal: ${signal ?? 'none'}`];

  if (context.pid) {
    parts.push(`pid: ${context.pid}`);
  }
  if (context.startTime) {
    parts.push(`uptime: ${Math.round((Date.now() - context.startTime) / 1000)}s`);
  }

  return parts.join(', ');
}
