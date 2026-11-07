export interface TerminalOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  name?: string;
  persistent?: boolean;
}

export interface TerminalSessionUpdate {
  name?: string;
  persistent?: boolean;
}

export interface TerminalSessionInfo {
  sessionId: string;
  pid: number;
  dimensions: { cols: number; rows: number };
  name?: string;
  persistent: boolean;
}

export interface TerminalManagerInterface {
  createSession(options?: TerminalOptions): Promise<TerminalSessionInfo>;
  listSessions(): Promise<TerminalSessionInfo[]>;
  generateOutput(sessionId: string): AsyncGenerator<Uint8Array>;
  writeInput(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, dimensions: { cols: number; rows: number }): Promise<void>;
  updateSession(sessionId: string, update: TerminalSessionUpdate): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
}

export interface TerminalManagerProxyEvents {
  sessionClosed: { sessionId: string };
}

export interface TerminalManagerProxyGenericEvent<K extends keyof TerminalManagerProxyEvents> {
  type: K;
  data: TerminalManagerProxyEvents[K];
}
