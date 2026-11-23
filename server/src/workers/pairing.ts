import { IS_ELECTRON } from '@camera.ui/common/utils';
import { X509Certificate } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { connect as connectTcp, isIP } from 'node:net';
import { connect as connectTls } from 'node:tls';

import { WorkersService } from '../api/services/workers.service.js';
import { DESKTOP_PORT_OFFSET, MASTER_API_PORT, workerName as nameOf } from '../services/config/defaults.js';
import { browseCameraUi } from '../services/mdns/browse.js';
import { FatalBootError } from '../utils/ipc.js';
import { PAIR_RETRY_MS, UNPAIRED_POLL_MS } from './lifecycle/timing.js';

import type { Logger } from '@camera.ui/common/logger';
import type { DBWorkerConnection } from '../api/database/types.js';
import type { ConfigService } from '../services/config/index.js';
import type { WorkerConfig } from '../services/config/types.js';

interface PairResponse {
  user: string;
  secret: string;
  ca: string;
  leafPort: number;
}

export type PairingState = { state: 'paired' } | { state: 'pairing' | 'unpaired'; reason: string; triedCode?: boolean };

const REQUEST_TIMEOUT_MS = 15_000;
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_INFO_BYTES = 64 * 1024;
const BROWSE_MS = 3000;
const DEFAULT_LEAF_PORTS = [7422, 7422 + DESKTOP_PORT_OFFSET];
const DEFAULT_API_PORTS = [MASTER_API_PORT, MASTER_API_PORT + DESKTOP_PORT_OFFSET];
const RETRY_STATUS = new Set([403, 408, 409, 429]);

class PairRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export class MasterProofError extends Error {}

export async function ensureWorkerPaired(configService: ConfigService, logger: Logger): Promise<PairingState> {
  const result = await pairOnce(configService.config.worker, logger);
  const fromPicker = IS_ELECTRON && !!process.env.CAMERA_UI_WORKER_PAIRING_CODE;
  if (fromPicker && result.state !== 'paired' && result.triedCode) {
    throw new FatalBootError(result.reason);
  }
  return result;
}

export async function pairOnce(worker: WorkerConfig | undefined, logger: Logger): Promise<PairingState> {
  const master = worker?.master;
  if (!master) {
    throw new FatalBootError('worker.master is not configured');
  }

  const workersService = new WorkersService();
  const connection = workersService.getWorkerConnection();
  const code = worker?.pairingCode?.trim();

  if (code && !workersService.isCodeUsed(code)) {
    return pairWithCode(workersService, worker, master, code, logger);
  }
  if (workersService.getUnpaired()) {
    return { state: 'unpaired', reason: `Removed by the master at ${connection?.master ?? master}. Pair again with a new code.` };
  }
  if (!connection) {
    return {
      state: 'unpaired',
      reason: code
        ? (workersService.refusalOf(code) ?? `The pairing code was used already. Generate a new one on the master at ${master} (Workers page).`)
        : `Not paired with ${master} yet. Generate a pairing code on the master (Workers page) and set worker.pairingCode.`,
    };
  }
  if ((connection.configuredMaster ?? connection.master) !== master) {
    return repoint(workersService, connection, master, logger);
  }
  return { state: 'paired' };
}

export function verifyMaster(host: string, port: number, ca: string, timeoutMs = VERIFY_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connectTcp({ host, port });
    let info = '';
    const fail = (error: Error): void => {
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs, () => fail(new Error(`${host}:${port} did not answer`)));
    socket.once('error', fail);
    socket.on('data', function onInfo(chunk: Buffer) {
      info += chunk.toString('latin1');
      if (!info.includes('\r\n')) {
        if (info.length > MAX_INFO_BYTES) fail(new MasterProofError(`${host}:${port} is not a camera.ui worker port`));
        return;
      }
      socket.off('data', onInfo);
      if (!info.startsWith('INFO ')) {
        fail(new MasterProofError(`${host}:${port} is not a camera.ui worker port`));
        return;
      }

      const secure = connectTls({ socket, ca, host, servername: isIP(host) ? undefined : host });
      secure.once('secureConnect', () => {
        secure.destroy();
        resolve();
      });
      secure.once('error', (error) => fail(new MasterProofError(error.message)));
    });
  });
}

export async function findMovedMaster(connection: DBWorkerConnection): Promise<Pick<DBWorkerConnection, 'master' | 'leafPort' | 'apiPort'> | undefined> {
  const stillThere = await verifyMaster(connection.master, connection.leafPort, connection.ca).then(
    () => true,
    () => false,
  );
  if (stillThere) return undefined;

  const current = new Set([connection.master, ...(await lookup(connection.master, { all: true }).catch(() => [])).map((entry) => entry.address)]);
  const leafPorts = [...new Set([connection.leafPort, ...DEFAULT_LEAF_PORTS])];
  const candidates = (await browseCameraUi(BROWSE_MS)).servers.flatMap((server) =>
    server.addresses.filter((host) => !current.has(host)).flatMap((host) => leafPorts.map((leafPort) => ({ master: host, leafPort, apiPort: server.port }))),
  );
  if (!candidates.length) return undefined;

  return Promise.any(
    candidates.map(async (candidate) => {
      await verifyMaster(candidate.master, candidate.leafPort, connection.ca);
      return candidate;
    }),
  ).catch(() => undefined);
}

export class PairingWait {
  private timer?: NodeJS.Timeout;
  private delay = PAIR_RETRY_MS[0];
  private stopped = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly onResult: (result: PairingState) => void,
  ) {}

  public start(state: 'pairing' | 'unpaired'): void {
    this.stopped = false;
    this.schedule(state);
  }

  public stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(state: 'pairing' | 'unpaired'): void {
    clearTimeout(this.timer);
    let wait = UNPAIRED_POLL_MS;
    if (state === 'pairing') {
      wait = this.delay;
      this.delay = Math.min(this.delay * 2, PAIR_RETRY_MS[1]);
    } else {
      this.delay = PAIR_RETRY_MS[0];
    }
    this.timer = setTimeout(() => this.attempt(), wait);
  }

  private async attempt(): Promise<void> {
    let result: PairingState;
    try {
      result = await pairOnce(this.configService.readWorkerConfig(), this.logger);
    } catch (error) {
      result = { state: 'unpaired', reason: error instanceof Error ? error.message : String(error) };
    }
    if (this.stopped) {
      return;
    }
    this.onResult(result);
    if (result.state !== 'paired') {
      this.schedule(result.state);
    }
  }
}

async function pairWithCode(workersService: WorkersService, worker: WorkerConfig | undefined, master: string, code: string, logger: Logger): Promise<PairingState> {
  const workerName = nameOf(worker);
  const agentId = workersService.getOrCreateAgentId(workerName);
  const apiPort = worker?.apiPort ?? MASTER_API_PORT;

  logger.log(`Pairing with master ${master}:${apiPort}...`);

  let response: PairResponse;
  try {
    response = await pairRequest(master, apiPort, { code, agentId, name: workerName });
  } catch (error) {
    const status = error instanceof PairRequestError ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (status && status >= 400 && status < 500 && !RETRY_STATUS.has(status)) {
      const reason = `The master at ${master} refused the pairing code: ${message}. Generate a new one there.`;
      workersService.markCodeUsed(code, reason);
      return { state: 'unpaired', reason, triedCode: true };
    }
    return { state: 'pairing', reason: message, triedCode: true };
  }

  workersService.saveWorkerConnection({ master, leafPort: response.leafPort, user: response.user, secret: response.secret, ca: response.ca });
  workersService.markCodeUsed(code);
  logger.log(`Paired with master ${master} as ${response.user}, CA fingerprint ${fingerprintOf(response.ca)}`);
  return { state: 'paired' };
}

function fingerprintOf(pem: string): string {
  try {
    return new X509Certificate(pem).fingerprint256;
  } catch {
    return 'unknown';
  }
}

async function repoint(workersService: WorkersService, connection: DBWorkerConnection, master: string, logger: Logger): Promise<PairingState> {
  try {
    await verifyMaster(master, connection.leafPort, connection.ca);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const moved = `worker.master changed from ${connection.master} to ${master}`;
    return {
      state: 'pairing',
      reason:
        error instanceof MasterProofError
          ? `${moved}, which is not the master this worker was paired with (${message}). Pair with a new code if it is another one.`
          : `${moved}, which does not answer yet: ${message}`,
    };
  }

  workersService.saveWorkerConnection({ ...connection, master, configuredMaster: undefined, apiPort: undefined });
  logger.log(`The master moved from ${connection.master} to ${master}, connecting there with the same pairing`);
  return { state: 'paired' };
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
        // the CA comes with the answer
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT_MS,
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
            reject(new PairRequestError(message, res.statusCode));
            return;
          }

          try {
            resolve(JSON.parse(data) as PairResponse);
          } catch {
            reject(new PairRequestError('pairing failed: invalid response from master'));
          }
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error(`pairing failed: master ${host}:${port} did not respond`)));
    req.on('error', (error) => reject(new PairRequestError(pairingFailure(host, port, error))));
    req.end(payload);
  });
}

function pairingFailure(host: string, port: number, error: NodeJS.ErrnoException): string {
  if (error.code !== 'EPROTO') return `pairing failed: ${error.message}`;
  const [serverPort, desktopPort] = DEFAULT_API_PORTS;
  const apiPort = DEFAULT_API_PORTS[DEFAULT_LEAF_PORTS.indexOf(port)];
  if (apiPort) return `pairing failed: ${port} is the master's worker connection port, pairing needs its HTTPS port ${apiPort}`;
  return `pairing failed: ${host}:${port} does not answer with HTTPS, pairing needs the master's HTTPS port (${serverPort}, or ${desktopPort} for a desktop app)`;
}
