import semver from 'semver';

import type { EngineIssue } from '../api/types/index.js';

export function checkEngineCompatibility(engines: Record<string, string> | undefined, hostVersion: string, nodeVersion: string): EngineIssue[] {
  if (!engines) {
    return [];
  }

  const issues: EngineIssue[] = [];

  const checks: { engine: EngineIssue['engine']; current: string }[] = [
    { engine: 'camera.ui', current: hostVersion },
    { engine: 'node', current: nodeVersion.replace(/^v/, '') },
  ];

  for (const { engine, current } of checks) {
    const required = engines[engine];

    if (!required || !semver.validRange(required, { loose: true })) {
      continue;
    }

    const coerced = semver.coerce(current);

    if (coerced && !semver.satisfies(coerced.version, required, { loose: true })) {
      issues.push({ engine, required, current });
    }
  }

  return issues;
}
