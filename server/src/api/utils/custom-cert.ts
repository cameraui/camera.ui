import { createPrivateKey, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSecureContext } from 'node:tls';
import { container } from 'tsyringe';

import { CUSTOM_CERT_FILENAME, CUSTOM_CHAIN_FILENAME, CUSTOM_KEY_FILENAME } from './constants.js';

import type { SecureContext } from 'node:tls';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';

export interface CustomCertificatePaths {
  certFile: string;
  keyFile: string;
  chainFile?: string;
}

export interface CustomCertificateInfo {
  names: string[];
  issuer: string;
  validFrom: string;
  validTo: string;
  chainLength: number;
  selfSigned: boolean;
}

export interface CustomCertificateProblem {
  code: 'unreadable' | 'no-certificate' | 'no-key' | 'key-mismatch' | 'expired' | 'not-yet-valid';
  detail?: string;
}

interface LoadedCertificate {
  context: SecureContext;
  certificate: X509Certificate;
  info: CustomCertificateInfo;
}

let cached: { stamp: string; loaded: LoadedCertificate | null } | undefined;

export function customCertificatePaths(configService: ConfigService): CustomCertificatePaths | undefined {
  const certFile = join(configService.CUSTOM_CERTS_PATH, CUSTOM_CERT_FILENAME);
  const keyFile = join(configService.CUSTOM_CERTS_PATH, CUSTOM_KEY_FILENAME);
  if (!existsSync(certFile) || !existsSync(keyFile)) return undefined;

  const chainFile = join(configService.CUSTOM_CERTS_PATH, CUSTOM_CHAIN_FILENAME);
  return { certFile, keyFile, chainFile: existsSync(chainFile) ? chainFile : undefined };
}

export function certificateNames(certificate: X509Certificate): string[] {
  const alt = certificate.subjectAltName;
  if (!alt) {
    const cn = /CN=([^\n,]+)/.exec(certificate.subject)?.[1]?.trim();
    return cn ? [cn] : [];
  }

  return alt
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('DNS:') || entry.startsWith('IP Address:'))
    .map((entry) => entry.slice(entry.indexOf(':') + 1).trim());
}

export function inspectCertificate(certPem: string, keyPem: string, chainPem?: string): { info: CustomCertificateInfo } | { problem: CustomCertificateProblem } {
  const blocks = splitPem(certPem);
  if (blocks.length === 0) return { problem: { code: 'no-certificate' } };

  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(blocks[0]);
  } catch (error: any) {
    return { problem: { code: 'unreadable', detail: error.message } };
  }

  try {
    const key = createPrivateKey(keyPem);
    if (!certificate.checkPrivateKey(key)) return { problem: { code: 'key-mismatch' } };
  } catch (error: any) {
    return { problem: { code: 'no-key', detail: error.message } };
  }

  const now = Date.now();
  if (Date.parse(certificate.validTo) < now) return { problem: { code: 'expired', detail: certificate.validTo } };
  if (Date.parse(certificate.validFrom) > now) return { problem: { code: 'not-yet-valid', detail: certificate.validFrom } };

  return {
    info: {
      names: certificateNames(certificate),
      issuer: /CN=([^\n,]+)/.exec(certificate.issuer)?.[1]?.trim() ?? certificate.issuer.split('\n')[0],
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      chainLength: blocks.length + splitPem(chainPem ?? '').length,
      selfSigned: certificate.subject === certificate.issuer,
    },
  };
}

export function loadCustomCertificate(): LoadedCertificate | null {
  const configService = container.resolve<ConfigService>('configService');
  const paths = customCertificatePaths(configService);
  if (!paths) {
    cached = undefined;
    return null;
  }

  const stamp = [paths.certFile, paths.keyFile, paths.chainFile]
    .map((file) => (file ? `${file}:${statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0}` : ''))
    .join('|');

  if (cached?.stamp === stamp) return cached.loaded;

  const logger = container.resolve<LoggerService>('logger');
  const loaded = build(paths, logger);
  cached = { stamp, loaded };
  return loaded;
}

export function customSecureContext(servername: string | undefined): SecureContext | undefined {
  if (!servername) return undefined;

  const loaded = loadCustomCertificate();
  if (!loaded) return undefined;

  return loaded.certificate.checkHost(servername) ? loaded.context : undefined;
}

export function logCustomCertificate(advertisedAddresses: string[]): void {
  const loaded = loadCustomCertificate();
  if (!loaded) return;

  const logger = container.resolve<LoggerService>('logger');
  const { names, issuer, validTo } = loaded.info;
  logger.log(`Custom certificate by ${issuer} in use for ${names.join(', ')} (valid until ${validTo})`);

  const days = Math.floor((Date.parse(validTo) - Date.now()) / 86_400_000);
  if (days <= 30) {
    logger.warn(`Custom certificate expires in ${days} day(s)`);
  }

  // an app that pinned this name to the instance CA before the certificate
  // appeared rejects it; newer apps fall back to the system store
  const internal = advertisedAddresses.filter((address) => loaded.certificate.checkHost(address));
  if (internal.length > 0) {
    const hint = 'apps older than the system-trust fallback cannot connect over that name';
    logger.warn(`Custom certificate also covers ${internal.join(', ')}, advertised as a local address by camera.ui: ${hint}`);
  }
}

function build(paths: CustomCertificatePaths, logger: LoggerService): LoadedCertificate | null {
  let certPem: string;
  let keyPem: string;
  let chainPem: string | undefined;

  try {
    certPem = readFileSync(paths.certFile, 'utf8');
    keyPem = readFileSync(paths.keyFile, 'utf8');
    chainPem = paths.chainFile ? readFileSync(paths.chainFile, 'utf8') : undefined;
  } catch (error: any) {
    logger.warn(`Custom certificate: ${paths.certFile} could not be read (${error.message}), serving the instance certificate`);
    return null;
  }

  const result = inspectCertificate(certPem, keyPem, chainPem);
  if ('problem' in result) {
    logger.warn(`Custom certificate: ${describe(result.problem)}, serving the instance certificate`);
    return null;
  }

  // the chain travels with the leaf, a separate file is appended for issuers
  // that ship them apart
  const cert = chainPem ? `${certPem.trimEnd()}\n${chainPem.trimStart()}` : certPem;

  try {
    return {
      context: createSecureContext({ cert, key: keyPem }),
      certificate: new X509Certificate(splitPem(certPem)[0]),
      info: result.info,
    };
  } catch (error: any) {
    logger.warn(`Custom certificate: ${error.message}, serving the instance certificate`);
    return null;
  }
}

function describe(problem: CustomCertificateProblem): string {
  switch (problem.code) {
    case 'key-mismatch':
      return 'the key does not belong to the certificate';
    case 'expired':
      return `the certificate expired on ${problem.detail}`;
    case 'not-yet-valid':
      return `the certificate is only valid from ${problem.detail}`;
    case 'no-key':
      return `the key could not be read (${problem.detail})`;
    case 'no-certificate':
      return 'the file holds no certificate';
    default:
      return problem.detail ?? 'the certificate could not be read';
  }
}

export interface CustomCertificateState {
  present: boolean;
  info?: CustomCertificateInfo;
  problem?: CustomCertificateProblem;
}

export function customCertificateState(): CustomCertificateState {
  const configService = container.resolve<ConfigService>('configService');
  const paths = customCertificatePaths(configService);
  if (!paths) return { present: false };

  const result = inspectCertificate(
    readFileSync(paths.certFile, 'utf8'),
    readFileSync(paths.keyFile, 'utf8'),
    paths.chainFile ? readFileSync(paths.chainFile, 'utf8') : undefined,
  );

  return 'problem' in result ? { present: true, problem: result.problem } : { present: true, info: result.info };
}

export async function storeCustomCertificate(
  cert: string,
  key: string,
  chain?: string,
): Promise<{ info: CustomCertificateInfo } | { problem: CustomCertificateProblem }> {
  const result = inspectCertificate(cert, key, chain);
  if ('problem' in result) return result;

  const configService = container.resolve<ConfigService>('configService');
  await mkdir(configService.CUSTOM_CERTS_PATH, { recursive: true });
  await writeFile(join(configService.CUSTOM_CERTS_PATH, CUSTOM_CERT_FILENAME), cert, { mode: 0o600 });
  await writeFile(join(configService.CUSTOM_CERTS_PATH, CUSTOM_KEY_FILENAME), key, { mode: 0o600 });

  const chainFile = join(configService.CUSTOM_CERTS_PATH, CUSTOM_CHAIN_FILENAME);
  if (chain?.trim()) {
    await writeFile(chainFile, chain, { mode: 0o600 });
  } else {
    await rm(chainFile, { force: true });
  }

  cached = undefined;
  return result;
}

export async function removeCustomCertificate(): Promise<void> {
  const configService = container.resolve<ConfigService>('configService');
  for (const name of [CUSTOM_CERT_FILENAME, CUSTOM_KEY_FILENAME, CUSTOM_CHAIN_FILENAME]) {
    await rm(join(configService.CUSTOM_CERTS_PATH, name), { force: true });
  }
  cached = undefined;
}

function splitPem(pem: string): string[] {
  return [...pem.matchAll(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g)].map((match) => match[0]);
}
