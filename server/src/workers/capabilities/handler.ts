import type { CapabilitySpec, WorkerCapability } from '../types.js';

export interface CapabilityHandler<C extends WorkerCapability = WorkerCapability> {
  readonly capability: C;
  start(id: string, spec: CapabilitySpec[C]): Promise<void>;
  stop(id: string): Promise<void>;
  stopAll(): Promise<void>;
  getActiveWorkIds(): string[];
  getActiveProcessIds(): number[];
}
