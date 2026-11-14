import { HardwareContext } from 'node-av/api';
import { AV_HWDEVICE_TYPE_CUDA } from 'node-av/constants';

import type { Logger } from '@camera.ui/common/logger';
import type { FrameWorkerDecoderSettings } from '@camera.ui/sdk';
import type { FFHWDeviceType } from 'node-av/constants';

const sharedDevices = new Map<string, { context: HardwareContext; users: number }>();

export function acquireHardwareContext(decoder: FrameWorkerDecoderSettings | undefined, logger: Logger): HardwareContext | null {
  const key = settingsKey(decoder);
  const shared = sharedDevices.get(key);
  if (shared) {
    shared.users++;
    return shared.context;
  }

  const context = createHardwareContext(decoder, logger);
  if (context?.deviceType === AV_HWDEVICE_TYPE_CUDA) sharedDevices.set(key, { context, users: 1 });
  return context;
}

export function releaseHardwareContext(context: HardwareContext): void {
  for (const [key, shared] of sharedDevices) {
    if (shared.context !== context) continue;
    if (--shared.users > 0) return;
    sharedDevices.delete(key);
    break;
  }

  context[Symbol.dispose]();
}

let probe: { key: string; available: boolean } | undefined;

export function hardwareDecodingAvailable(decoder: FrameWorkerDecoderSettings | undefined, logger: Logger): boolean {
  const key = settingsKey(decoder);
  if (probe?.key === key) return probe.available;

  const context = createHardwareContext(decoder, logger);
  const available = context !== null;
  context?.[Symbol.dispose]();

  probe = { key, available };
  return available;
}

function createHardwareContext(decoder: FrameWorkerDecoderSettings | undefined, logger: Logger): HardwareContext | null {
  const hardware = decoder?.hardware ?? 'auto';
  if (hardware === 'cpu') return null;

  if (hardware !== 'auto') {
    let device = decoder?.device?.trim();
    if (device === '') device = undefined;
    const context = HardwareContext.create(hardware as FFHWDeviceType, device);
    if (context) return context;
    logger.warn(`Configured decoder hardware "${hardware}${device ? ` (${device})` : ''}" is not usable on this machine, falling back to auto`);
  }

  return HardwareContext.auto();
}

function settingsKey(decoder: FrameWorkerDecoderSettings | undefined): string {
  return `${decoder?.hardware ?? 'auto'}|${decoder?.device?.trim() ?? ''}`;
}
