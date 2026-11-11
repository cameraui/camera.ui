import { setCertTrustInstaller } from '@/connection/index.js';
import { isCapacitor } from '@/connection/runtime.js';

import type { CertTrustPayload } from '@/types/electron.js';

interface CertTrustPlugin {
  trust(options: { ca?: string; leafSha256?: string; hosts: string[]; direct?: boolean }): Promise<void>;
}

const log = useLogger();

let plugin: CertTrustPlugin | null = null;

export function installCertTrustBridge(): void {
  const { electron } = useElectron();
  if (electron) {
    // older desktop builds reject the call, trustInternalCa swallows that
    setCertTrustInstaller(async ({ ca, hosts }) => {
      if (!ca) return;
      await electron.invoke('cert-trust', { ca, hosts: [...hosts] } satisfies CertTrustPayload);
      log.debug(`[cert-trust] instance CA handed to the desktop app for ${hosts.length} host(s)`);
    });
    return;
  }

  if (!isCapacitor) return;

  setCertTrustInstaller(async ({ hosts, ...trust }) => {
    if (!plugin) {
      const { registerPlugin } = await import('@capacitor/core');
      plugin = registerPlugin<CertTrustPlugin>('CertTrust');
    }
    await plugin.trust({ ...trust, hosts: [...hosts] });
    log.debug(`[cert-trust] instance trust set for ${hosts.length} host(s)`);
  });
}
