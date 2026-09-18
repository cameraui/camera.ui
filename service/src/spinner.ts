import { WriteStream } from 'node:tty';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL = 80;

const HIDE_CURSOR = '\u001B[?25l';
const SHOW_CURSOR = '\u001B[?25h';
const CLEAR_RIGHT = '\r\u001B[0K';

export type SymbolLevel = 'info' | 'succeed' | 'warn' | 'fail';

const hasColors = WriteStream.prototype.hasColors?.() ?? false;

function paint(code: number, text: string): string {
  return hasColors ? `\u001B[${code}m${text}\u001B[39m` : text;
}

function unicodeSupported(): boolean {
  const { env } = process;

  if (process.platform !== 'win32') {
    return env.TERM !== 'linux';
  }

  return (
    Boolean(env.WT_SESSION) ||
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === '{cmd::Cmder}' ||
    env.TERM_PROGRAM === 'Terminus-Sublime' ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM === 'xterm-256color' ||
    env.TERM === 'alacritty' ||
    env.TERM === 'rxvt-unicode' ||
    env.TERM === 'rxvt-unicode-256color' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm'
  );
}

const unicode = unicodeSupported();

const SYMBOLS: Record<SymbolLevel, string> = {
  info: paint(34, unicode ? 'ℹ' : 'i'),
  succeed: paint(32, unicode ? '✔' : '√'),
  warn: paint(33, unicode ? '⚠' : '‼'),
  fail: paint(31, unicode ? '✖' : '×'),
};

export function printSymbol(level: SymbolLevel, text: string, stream: NodeJS.WriteStream = process.stderr): void {
  stream.write(`${SYMBOLS[level]} ${text}\n`);
}

export interface SpinnerOptions {
  text: string;
  stream?: NodeJS.WriteStream;
}

export class Spinner {
  public text: string;

  private stream: NodeJS.WriteStream;
  private animated: boolean;
  private timer?: NodeJS.Timeout;
  private frame = 0;

  private readonly onExit = (): void => {
    this.stop();
  };

  private readonly onSignal = (signal: NodeJS.Signals): void => {
    this.stop();

    if (process.listenerCount(signal) === 0) {
      process.kill(process.pid, signal);
    }
  };

  constructor(options: SpinnerOptions) {
    this.text = options.text;
    this.stream = options.stream ?? process.stderr;
    this.animated = Boolean(this.stream.isTTY) && process.env.TERM !== 'dumb' && !('CI' in process.env);
  }

  public start(): this {
    if (!this.animated) {
      if (this.text) {
        this.stream.write(`- ${this.text}\n`);
      }

      return this;
    }

    if (this.timer) {
      return this;
    }

    this.stream.write(HIDE_CURSOR);
    this.render();

    this.timer = setInterval(() => this.render(), FRAME_INTERVAL);
    process.on('exit', this.onExit);
    process.on('SIGINT', this.onSignal);
    process.on('SIGTERM', this.onSignal);

    return this;
  }

  public succeed(text = this.text): this {
    return this.persist('succeed', text);
  }

  public fail(text = this.text): this {
    return this.persist('fail', text);
  }

  public stop(): this {
    if (!this.timer) {
      return this;
    }

    clearInterval(this.timer);
    this.timer = undefined;

    process.off('exit', this.onExit);
    process.off('SIGINT', this.onSignal);
    process.off('SIGTERM', this.onSignal);

    this.stream.write(`${CLEAR_RIGHT}${SHOW_CURSOR}`);

    return this;
  }

  private persist(level: SymbolLevel, text: string): this {
    this.stop();
    this.stream.write(`${SYMBOLS[level]} ${text}\n`);

    return this;
  }

  private render(): void {
    this.stream.write(`${CLEAR_RIGHT}${paint(36, FRAMES[this.frame])} ${this.text}`);
    this.frame = (this.frame + 1) % FRAMES.length;
  }
}
