import semver from 'semver';

export function compareDatabaseVersions(a: string, b: string): number {
  // 2.4.10-1 is the migration after 2.4.10, semver would read it as a pre-release before it
  const [releaseA, stepA = '0'] = a.split('-');
  const [releaseB, stepB = '0'] = b.split('-');
  return semver.compare(releaseA, releaseB) || Number(stepA) - Number(stepB);
}
