import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { toolError } from './shared.js';

import type { SocketService } from '../../api/websocket/index.js';
import type { MetricsNamespace } from '../../api/websocket/nsp/metrics.js';
import type { ProcessInfo } from '../../api/websocket/types.js';
import type { CoreTool, ToolContext } from './shared.js';

function compact(info: ProcessInfo | undefined | null) {
  if (!info) return undefined;
  return { cpu: info.cpuLoad, memory: info.memLoad, worker: info.worker, perf: info.perf };
}

const getMetrics = toolDefinition({
  name: 'get_metrics',
  lazy: true,
  description:
    'Current load of the instance: CPU and memory of the host, the camera.ui server, the streaming engine, every plugin and every remote worker, ' +
    'plus inference timings where a plugin reports them. Use it for "how busy is", "how much load", "is X slow" questions.',
  inputSchema: zod.object({}),
}).server<ToolContext['context']>(() => {
  const metrics = container.resolve<SocketService>('socketService').namespaces.get('/metrics') as MetricsNamespace | undefined;
  const snapshot = metrics?.snapshot();
  if (!snapshot?.processes) return toolError('Metrics are not collected yet, ask again in a few seconds.');

  const { processes, system } = snapshot;
  const named = (group: Record<string, ProcessInfo> | undefined) => Object.fromEntries(Object.entries(group ?? {}).map(([name, info]) => [name, compact(info)]));

  return {
    system: compact(system),
    server: compact(processes['camera.ui']),
    streamingEngine: compact(processes.go2rtc),
    messaging: compact(processes.nats),
    plugins: named(processes.plugins),
    workers: named(processes.workers),
    collectedAt: system?.timestamp ? new Date(system.timestamp).toISOString() : undefined,
  };
});

export const metricsTools: CoreTool[] = [getMetrics];
