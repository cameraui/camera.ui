import semver from 'semver';

import { checkEngineCompatibility, checkProtocolCompat } from '../../utils/engines.js';
import { getPackument } from '../../utils/npm/index.js';
import { describePlatformRequirement, isPlatformCompatible, platformRequirement } from '../../utils/platform.js';
import { getBlock, getBlocklist } from '../../utils/plugin-registry/index.js';

import type { PluginBackupInfo, RestorePluginIssue, RestorePluginResult } from '../../api/types/index.js';
import type { PackageManifest, RegistryError } from '../../utils/npm/registry.js';

export type RestorePluginTarget = Pick<RestorePluginResult, 'note' | 'issue' | 'reason'> & { version: string };

const REPORT_BUDGET_MS = 8000;

export async function describeRestoredPlugins(plugins: PluginBackupInfo[], hostVersion: string, workers: Record<string, string> = {}): Promise<RestorePluginResult[]> {
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), REPORT_BUDGET_MS);
  });

  try {
    return await Promise.all(
      plugins.map(async (plugin): Promise<RestorePluginResult> => {
        const target = await Promise.race([resolveRestoredPluginVersion(plugin, hostVersion).catch(() => undefined), budget]);
        return {
          name: plugin.name,
          version: plugin.version,
          state: 'pending',
          ...(target && target.version !== plugin.version && { installVersion: target.version }),
          ...(target?.note && { note: target.note, issue: target.issue, reason: target.reason }),
          ...(workers[plugin.name] && { worker: workers[plugin.name] }),
        };
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveRestoredPluginVersion(plugin: Pick<PluginBackupInfo, 'name' | 'version'>, hostVersion: string): Promise<RestorePluginTarget> {
  const { name, version: saved } = plugin;

  let versions: Record<string, PackageManifest>;
  let latest: string | undefined;
  try {
    const packument = await getPackument(name, { full: true });
    versions = packument.versions ?? {};
    latest = packument['dist-tags']?.latest;
  } catch (error) {
    if ((error as RegistryError).code === 'E404') return unavailable(saved, { code: 'not-in-registry' });
    // an unreachable registry keeps the saved version, the install names the real error
    return { version: saved };
  }

  const blocklist = await getBlocklist();
  const issue = ({ version, cameraui, engines }: PackageManifest): RestorePluginIssue | undefined => {
    const block = getBlock(name, version, blocklist);
    if (block) return { code: 'blocked', version, detail: block.reason };

    const protocol = checkProtocolCompat(cameraui?.protocolLevel);
    if (protocol === 'serverTooOld') return { code: 'needs-newer-server', version };
    if (protocol === 'pluginTooOld') return { code: 'built-for-older-server', version };

    const engine = checkEngineCompatibility(engines, hostVersion, process.version)[0];
    return engine ? { code: 'engine', version, engine: engine.engine, required: engine.required } : undefined;
  };

  const savedManifest = versions[saved];
  const savedIssue: RestorePluginIssue | undefined = savedManifest ? issue(savedManifest) : { code: 'gone', version: saved };
  if (!savedIssue) return describe(savedManifest);

  const stable = !semver.prerelease(saved);
  const capped = stable && !!latest && !!semver.valid(latest);
  const candidate = Object.values(versions)
    .filter((manifest) => semver.valid(manifest.version) && (!stable || !semver.prerelease(manifest.version)) && (!capped || semver.lte(manifest.version, latest)))
    .sort((a, b) => semver.rcompare(a.version, b.version))
    .find((manifest) => !issue(manifest));

  if (!candidate) return unavailable(saved, savedIssue);
  return describe(candidate);
}

export function describeRestorePluginIssue(issue: RestorePluginIssue): string {
  switch (issue.code) {
    case 'not-in-registry':
      return 'It is not in the plugin registry.';
    case 'gone':
      return `Version ${issue.version} is gone from the registry.`;
    case 'blocked':
      return `Version ${issue.version} is blocked: ${issue.detail}`;
    case 'needs-newer-server':
      return `Version ${issue.version} needs a newer camera.ui.`;
    case 'built-for-older-server':
      return `Version ${issue.version} was built for an older camera.ui.`;
    case 'engine':
      return `Version ${issue.version} needs ${issue.engine} ${issue.required}.`;
    case 'platform':
      return `It needs ${describePlatformRequirement(issue)}.`;
  }
}

function unavailable(version: string, issue: RestorePluginIssue): RestorePluginTarget {
  const reason = describeRestorePluginIssue(issue);
  return { version, note: 'unavailable', issue, reason: issue.code === 'not-in-registry' ? reason : `${reason} No other version runs on this camera.ui.` };
}

function describe(manifest: PackageManifest): RestorePluginTarget {
  const { version } = manifest;
  const requirement = platformRequirement(manifest);
  if (isPlatformCompatible(requirement)) return { version };
  const { os, cpu, libc } = requirement;
  const issue: RestorePluginIssue = { code: 'platform', ...(os?.length && { os }), ...(cpu?.length && { cpu }), ...(libc?.length && { libc }) };
  return { version, note: 'platform', issue, reason: describeRestorePluginIssue(issue) };
}
