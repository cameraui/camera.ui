export type LogTarget = string | undefined;

export interface LogsSocketOptions {
  target?: LogTarget;
  onStdout?: (data: string) => void;
  onDisconnect?: () => void;
  onClearLog?: (source: string) => void;
  onReconnected?: () => void;
}

export function useLogsSocket(options: LogsSocketOptions = {}) {
  const { target, onStdout, onDisconnect, onClearLog, onReconnected } = options;
  const channel = useSocket('/logs');

  let hasConnectedOnce = false;

  if (target) {
    channel.on<string>(`stdout/${target}`, (data) => onStdout?.(data));
  }
  channel.on('clear-log', (source?: string) => onClearLog?.(source ?? 'all'));

  channel.onReady(() => {
    if (hasConnectedOnce) onReconnected?.();
    hasConnectedOnce = true;
  });

  watch(channel.connected, (connected, was) => {
    if (!connected && was) onDisconnect?.();
  });

  function connect(): void {
    // the channel is live from the first call
  }

  function disconnect(): void {
    // teardown follows the caller's scope
  }

  function reportSize(cols: number): void {
    if (target && cols > 0) {
      channel.emit('term-size', { target, cols });
    }
  }

  return {
    isConnected: channel.connected,
    connect,
    disconnect,
    reportSize,
  };
}
