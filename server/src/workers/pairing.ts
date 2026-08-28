import { request } from 'node:https';

import { WorkersService } from '../api/services/workers.service.js';
import { FatalBootError } from '../utils/ipc.js';

import type { Logger } from '@camera.ui/common/logger';
import type { ConfigService } from '../services/config/index.js';

const MASTER_API_PORT = 3443;

interface PairResponse {
  user: string;
  secret: string;
  ca: string;
  leafPort: number;
}

export async function ensureWorkerPaired(configService: ConfigService, logger: Logger): Promise<void> {
  const workerConfig = configService.config.worker;
  const master = workerConfig?.master;

  if (!master) {
    throw new FatalBootError('worker.master is not configured');
  }

  const workersService = new WorkersService();
  const connection = workersService.getWorkerConnection();
  const pairingCode = workerConfig?.pairingCode;

  if (connection?.master === master && (!pairingCode || pairingCode === connection.pairingCode)) {
    return;
  }

  if (!pairingCode) {
    throw new FatalBootError(`Worker is not paired with ${master}. Generate a pairing code on the master (Workers view) and set worker.pairingCode`);
  }

  const workerName = workerConfig?.name ?? 'worker';
  const agentId = workersService.getOrCreateAgentId(workerName);
  const apiPort = workerConfig?.apiPort ?? MASTER_API_PORT;

  logger.log(`Pairing with master ${master}:${apiPort}...`);

  let response: PairResponse;
  try {
    response = await pairRequest(master, apiPort, {
      code: pairingCode,
      agentId,
      name: workerName,
    });
  } catch (error) {
    // a wrong address, port or code does not fix itself, no point in a restart loop
    throw new FatalBootError(error instanceof Error ? error.message : String(error));
  }

  workersService.saveWorkerConnection({
    master,
    leafPort: response.leafPort,
    user: response.user,
    secret: response.secret,
    ca: response.ca,
    pairingCode,
  });

  logger.log(`Paired with master ${master} as ${response.user}`);
}

function pairRequest(host: string, port: number, body: { code: string; agentId: string; name: string }): Promise<PairResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const req = request(
      {
        host,
        port,
        path: '/api/workers/pair',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        // Self-signed master cert
        rejectUnauthorized: false,
        timeout: 15_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            let message = `pairing failed with status ${res.statusCode}`;
            try {
              message = JSON.parse(data).message ?? message;
            } catch {
              // keep status message
            }
            reject(new Error(message));
            return;
          }

          try {
            resolve(JSON.parse(data) as PairResponse);
          } catch {
            reject(new Error('pairing failed: invalid response from master'));
          }
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error(`pairing failed: master ${host}:${port} did not respond`)));
    req.on('error', (error) => reject(new Error(`pairing failed: ${error.message}`)));
    req.end(payload);
  });
}
