import { cyan, darkGray, green, red, yellow } from 'ansicolor';

const MIN_COLS = 24;
const FALLBACK_COLS = 80;

const terminalCols = new Map<string, number>();

export function setTerminalCols(target: string, cols: number): void {
  if (Number.isFinite(cols) && cols > 0) {
    terminalCols.set(target, Math.floor(cols));
  }
}

export function getTerminalCols(target: string, fallback = FALLBACK_COLS): number {
  return terminalCols.get(target) ?? fallback;
}

export function elidePath(value: string, max = 48): string {
  if (value.length <= max) {
    return value;
  }

  return `…${value.slice(value.length - (max - 1))}`;
}

export class InstallLogger {
  private pendingStep = false;
  private currentLabel = '';
  private lineBuffer = '';

  constructor(
    private emit: (message: string) => void,
    private width: () => number = () => FALLBACK_COLS,
  ) {}

  header(title: string, meta: Record<string, string>): void {
    this.emit(cyan(`\r\n${title}\r\n`));

    for (const [key, value] of Object.entries(meta)) {
      this.emit(`${darkGray(key.padEnd(10))}${value}\r\n`);
    }

    this.emit('\r\n');
  }

  step(label: string): void {
    this.currentLabel = label;
    this.pendingStep = true;
    this.emit(`${cyan('▸')} ${label}`);
  }

  progress(percent: number): void {
    this.emit(`\r${this.row(`${percent} %`, cyan)}`);
  }

  done(note = 'done'): void {
    this.emit(`\r${this.row(note, green)}\r\n`);
    this.pendingStep = false;
  }

  block(label: string): void {
    this.pendingStep = false;
    this.emit(`${cyan('▸')} ${label}\r\n`);
  }

  sub(text: string): void {
    this.emit(`    ${text}\r\n`);
  }

  blank(): void {
    this.emit('\r\n');
  }

  raw(chunk: string): void {
    this.emit(chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n'));
  }

  feed(chunk: string): void {
    this.lineBuffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        this.sub(line);
      }
    }
  }

  flush(): void {
    if (this.lineBuffer.trim()) {
      this.sub(this.lineBuffer);
    }
    this.lineBuffer = '';
  }

  warn(text: string): void {
    this.emit(yellow(`${text}\r\n`));
  }

  success(text: string): void {
    this.finishOpenStep();
    this.emit(green(`\r\n✓ ${text}\r\n\r\n`));
  }

  error(text: string): void {
    this.finishOpenStep(true);
    this.emit(red(`\r\n✗ ${text}\r\n\r\n`));
  }

  private row(status: string, color: (value: string) => string): string {
    const cols = Math.max(MIN_COLS, this.width() - 1);
    const used = 2 + this.currentLabel.length;
    const dots = Math.max(1, cols - used - status.length - 2);
    return `${cyan('▸')} ${this.currentLabel} ${darkGray('·'.repeat(dots))} ${color(status)}`;
  }

  private finishOpenStep(failed = false): void {
    if (!this.pendingStep) {
      return;
    }

    this.emit(`\r${this.row(failed ? 'failed' : 'done', failed ? red : green)}\r\n`);
    this.pendingStep = false;
  }
}
