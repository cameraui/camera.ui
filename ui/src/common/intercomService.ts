import { isCapacitor } from '@/connection/runtime.js';

interface IntercomServicePlugin {
  start(): Promise<{ started: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
}

const log = useLogger();

let pluginPromise: Promise<IntercomServicePlugin | null> | null = null;

async function getPlugin(): Promise<IntercomServicePlugin | null> {
  if (!isCapacitor) return null;
  if (!pluginPromise) {
    pluginPromise = (async () => {
      const { Capacitor, registerPlugin } = await import('@capacitor/core');
      if (Capacitor.getPlatform() !== 'android') return null;
      return registerPlugin<IntercomServicePlugin>('IntercomService');
    })();
  }
  return pluginPromise;
}

export async function startIntercomService(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.start();
  } catch (error) {
    log.warn('IntercomService.start failed', error);
  }
}

export async function stopIntercomService(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.stop();
  } catch (error) {
    log.warn('IntercomService.stop failed', error);
  }
}
