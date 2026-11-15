import { compareVersions, validate } from 'compare-versions';

export const MIN_SERVER_VERSION = '2.5.0';
export const MIN_NVR_PLUGIN_VERSION = '1.6.0';

export interface OutdatedComponent {
  component: 'server' | 'nvr';
  found: string;
  required: string;
}

export function outdatedComponents(serverVersion: string | undefined, nvrPluginVersion: string | null | undefined): OutdatedComponent[] {
  const outdated: OutdatedComponent[] = [];
  if (serverVersion && isOlder(serverVersion, MIN_SERVER_VERSION)) {
    outdated.push({ component: 'server', found: serverVersion, required: MIN_SERVER_VERSION });
  }
  if (nvrPluginVersion && isOlder(nvrPluginVersion, MIN_NVR_PLUGIN_VERSION)) {
    outdated.push({ component: 'nvr', found: nvrPluginVersion, required: MIN_NVR_PLUGIN_VERSION });
  }
  return outdated;
}

function isOlder(version: string, minimum: string): boolean {
  const core = version.trim().replace(/^v/, '').split(/[-+]/)[0];
  return validate(core) && compareVersions(core, minimum) < 0;
}
