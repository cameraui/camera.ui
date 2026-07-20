export interface RunTraceEntry {
  nodeId: string;
  nodeType: string;
  status: 'completed' | 'skipped' | 'error';
  handle?: string;
  error?: string;
  startedAt: number;
  durationMs?: number;
}

export interface AutomationRun {
  flowId: string;
  startedAt: number;
  finishedAt: number;
  status: 'success' | 'error';
  error?: string;
  triggerType: string;
  entries: RunTraceEntry[];
  warnings: string[];
}

const MAX_ENTRIES = 200;
const MAX_WARNINGS = 20;

export class RunTrace {
  public entries: RunTraceEntry[] = [];
  public warnings: string[] = [];

  public addEntry(entry: RunTraceEntry): void {
    if (this.entries.length >= MAX_ENTRIES) return;
    this.entries.push(entry);
  }

  public addWarning(message: string): void {
    if (this.warnings.length >= MAX_WARNINGS || this.warnings.includes(message)) return;
    this.warnings.push(message);
  }
}
