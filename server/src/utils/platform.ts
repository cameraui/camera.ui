function matchesNpmList(list: string[] | undefined, value: string): boolean {
  if (!list?.length) {
    return true;
  }

  const negations = list.filter((entry) => entry.startsWith('!')).map((entry) => entry.slice(1));
  const positives = list.filter((entry) => !entry.startsWith('!'));

  if (negations.includes(value)) {
    return false;
  }

  if (positives.length === 0) {
    return true;
  }

  return positives.includes(value);
}

export function isPlatformCompatible(os?: string[], cpu?: string[], platform: string = process.platform, arch: string = process.arch): boolean {
  return matchesNpmList(os, platform) && matchesNpmList(cpu, arch);
}

export function describePlatformRequirement(os?: string[], cpu?: string[]): string {
  const parts: string[] = [];
  if (os?.length) parts.push(`os=[${os.join(', ')}]`);
  if (cpu?.length) parts.push(`cpu=[${cpu.join(', ')}]`);
  return parts.length ? parts.join(' ') : 'any platform';
}
