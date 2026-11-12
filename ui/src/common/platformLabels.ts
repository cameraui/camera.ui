const OS_LABELS: Record<string, string> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows', freebsd: 'FreeBSD' };
const CPU_LABELS: Record<string, string> = { x64: 'x64', arm64: 'ARM64', arm: 'ARM', ia32: 'x86' };
const LIBC_LABELS: Record<string, string> = { glibc: 'glibc', musl: 'musl' };

function humanize(value: string, labels: Record<string, string>): string {
  const negated = value.startsWith('!');
  const key = negated ? value.slice(1) : value;
  const label = labels[key] ?? key;
  return negated ? `✕ ${label}` : label;
}

export function humanizeOs(value: string): string {
  return humanize(value, OS_LABELS);
}

export function humanizeCpu(value: string): string {
  return humanize(value, CPU_LABELS);
}

export function humanizeLibc(value: string): string {
  return humanize(value, LIBC_LABELS);
}

export function describePlatform(os?: string[], cpu?: string[], libc?: string[]): string {
  return [...(os ?? []).map(humanizeOs), ...(cpu ?? []).map(humanizeCpu), ...(libc ?? []).map(humanizeLibc)].join(' · ');
}
