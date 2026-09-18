import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => process.env[name] ?? '');
}

function parseNpmrc(file: string): Record<string, string> {
  if (!existsSync(file)) {
    return {};
  }

  const config: Record<string, string> = {};

  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    const value = interpolateEnv(
      line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, ''),
    );

    if (key) {
      config[key] = value;
    }
  }

  return config;
}

export function nerfDart(registry: string): string {
  try {
    const url = new URL(registry);
    return `//${url.host}${url.pathname}`;
  } catch {
    return '//registry.npmjs.org/';
  }
}

export type NpmConfig = Record<string, string>;

export function resolveNpmOptions(): NpmConfig {
  const merged: Record<string, string> = {
    ...parseNpmrc(join(homedir(), '.npmrc')),
    ...parseNpmrc(join(process.cwd(), '.npmrc')),
  };

  const registry = merged.registry || DEFAULT_REGISTRY;

  const envToken = [process.env.CAMERAUI_NPM_TOKEN, process.env.NPM_TOKEN].find(Boolean);
  if (envToken) {
    merged[`${nerfDart(registry)}:_authToken`] = envToken;
  }

  return { ...merged, registry };
}
