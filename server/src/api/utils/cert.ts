import { fetchViableNetworkAddresses } from '@camera.ui/common/network';
import forge from 'node-forge';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { container } from 'tsyringe';

import { ServerService } from '../services/server.service.js';
import { DEFAULTS } from './constants.js';

import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { DBServer } from '../database/types.js';

export interface Certificate {
  cert: string;
  key: string;
  certPath: string;
  keyPath: string;
}

export interface Certificates extends Certificate {
  ca: string;
  caPath: string;
}

const makeNumberPositive = (hexString: string): string => {
  let mostSignificativeHexDigitAsInt = Number.parseInt(hexString[0], 16);
  if (mostSignificativeHexDigitAsInt < 8) return hexString;
  mostSignificativeHexDigitAsInt -= 8;
  return mostSignificativeHexDigitAsInt.toString() + hexString.slice(1);
};

const randomSerialNumber = (): string => {
  return makeNumberPositive(forge.util.bytesToHex(forge.random.getBytesSync(20)));
};

const getCertNotBefore = (): Date => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  return new Date(twoDaysAgo.toISOString().split('T')[0] + 'T00:00:00Z');
};

const getCertNotAfter = (notBefore: Date): Date => {
  const ninetyDaysLater = new Date(notBefore.getTime() + 390 * 24 * 60 * 60 * 1000);
  return new Date(ninetyDaysLater.toISOString().split('T')[0] + 'T23:59:59Z');
};

const getCANotAfter = (notBefore: Date): Date => {
  const hundredYearsLater = new Date(notBefore);
  hundredYearsLater.setFullYear(hundredYearsLater.getFullYear() + 100);
  return new Date(hundredYearsLater.toISOString().split('T')[0] + 'T23:59:59Z');
};

const logCertificate = (message: string): void => {
  try {
    container.resolve<LoggerService>('logger').log(message);
  } catch {
    console.log(message);
  }
};

const storedServerInfo = (): DBServer | undefined => {
  try {
    return new ServerService().info();
  } catch {
    return undefined;
  }
};

const hostOfUrl = (value: string | undefined): string | undefined => {
  if (!value?.trim()) return undefined;
  try {
    const hostname = new URL(value).hostname;
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  } catch {
    return undefined;
  }
};

const isCertificateValid = (certPath: string): boolean => {
  const cert = forge.pki.certificateFromPem(readFileSync(certPath, 'utf8'));
  const now = new Date();
  return now >= cert.validity.notBefore && now <= cert.validity.notAfter;
};

const getCertAltNames = (certPath: string): string[] => {
  try {
    const cert = forge.pki.certificateFromPem(readFileSync(certPath, 'utf8'));
    const extension: any = cert.getExtension('subjectAltName');
    return ((extension?.altNames ?? []) as any[]).map((alt) => alt.ip ?? alt.value).filter(Boolean);
  } catch {
    return [];
  }
};

const isLegacyCertificate = (certPath: string): boolean => {
  try {
    const certPem = readFileSync(certPath, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);

    const subject = cert.subject.getField('O');
    const ou = cert.subject.getField('OU');
    const cn = cert.subject.getField('CN');

    return subject?.value === 'camera.ui' && ou?.value === 'cui' && cn && (cn.value === 'camera.ui root certificate' || cn.value.startsWith('camera.ui'));
  } catch (error) {
    console.error('Error checking legacy certificate:', error);
    return false;
  }
};

export class CertificateGeneration {
  static createRootCA(customAddresses: string[]): Certificate {
    const configService = container.resolve<ConfigService>('configService');
    const serialNumber = randomSerialNumber();

    const addresses: any[] = customAddresses.map((address) => ({
      type: isIPv4(address) || isIPv6(address) ? 7 : 2,
      ip: isIPv4(address) || isIPv6(address) ? address : undefined,
      value: !(isIPv4(address) || isIPv6(address)) ? address : undefined,
    }));

    if (!addresses.some((addr) => addr.ip === '127.0.0.1')) {
      addresses.push({ type: 7, ip: '127.0.0.1' });
    }

    const attributes = [
      { shortName: 'C', value: DEFAULTS.C },
      { shortName: 'ST', value: DEFAULTS.ST },
      { shortName: 'L', value: DEFAULTS.L },
      { shortName: 'CN', value: DEFAULTS.ROOT_CN },
      { shortName: 'O', value: DEFAULTS.O },
      { shortName: 'OU', value: DEFAULTS.OU },
    ];

    const extensions = [
      { name: 'basicConstraints', cA: true, critical: true },
      {
        name: 'keyUsage',
        critical: true,
        keyCertSign: true,
        cRLSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: 'nsCertType',
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true,
      },
      { name: 'subjectKeyIdentifier' },
      { name: 'authorityKeyIdentifier', keyIdentifier: true },
      { name: 'subjectAltName', altNames: addresses },
    ];

    const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = publicKey;
    cert.serialNumber = serialNumber;
    cert.validity.notBefore = getCertNotBefore();
    cert.validity.notAfter = getCANotAfter(cert.validity.notBefore);

    cert.setSubject(attributes);
    cert.setIssuer(attributes);
    cert.setExtensions(extensions);

    cert.sign(privateKey, forge.md.sha256.create());

    const pemCert = forge.pki.certificateToPem(cert);
    const pemPrivateKey = forge.pki.privateKeyToPem(privateKey);

    const rootCertFilePath = configService.ROOT_CERT_FILE;
    const rootPrivateKeyFilePath = configService.ROOT_KEY_FILE;

    writeFileSync(rootCertFilePath, pemCert);
    writeFileSync(rootPrivateKeyFilePath, pemPrivateKey);

    return { cert: pemCert, certPath: rootCertFilePath, key: pemPrivateKey, keyPath: rootPrivateKeyFilePath };
  }

  static createHostCert(customAddresses: string[], rootCAObject: Certificate): Certificate {
    const configService = container.resolve<ConfigService>('configService');
    const addresses: any[] = customAddresses.map((address) => ({
      type: isIPv4(address) || isIPv6(address) ? 7 : 2,
      ip: isIPv4(address) || isIPv6(address) ? address : undefined,
      value: !(isIPv4(address) || isIPv6(address)) ? address : undefined,
    }));

    if (!addresses.some((addr) => addr.ip === '127.0.0.1')) {
      addresses.push({ type: 7, ip: '127.0.0.1' });
    }

    const keyPairs = forge.pki.rsa.generateKeyPair(2048);

    const caCert = forge.pki.certificateFromPem(rootCAObject.cert);
    const caKey = forge.pki.privateKeyFromPem(rootCAObject.key);

    const attributes = [
      { shortName: 'C', value: DEFAULTS.C },
      { shortName: 'ST', value: DEFAULTS.ST },
      { shortName: 'L', value: DEFAULTS.L },
      { shortName: 'CN', value: DEFAULTS.CN },
      { shortName: 'O', value: DEFAULTS.O },
    ];

    const extensions = [
      { name: 'basicConstraints', cA: false },
      { name: 'nsCertType', server: true },
      { name: 'subjectKeyIdentifier' },
      {
        name: 'authorityKeyIdentifier',
        authorityCertIssuer: true,
        serialNumber: caCert.serialNumber,
      },
      {
        name: 'keyUsage',
        critical: true,
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        critical: true,
        serverAuth: true,
        clientAuth: true,
      },
      { name: 'subjectAltName', altNames: addresses },
    ];

    const cert = forge.pki.createCertificate();

    cert.publicKey = keyPairs.publicKey;
    cert.serialNumber = randomSerialNumber();
    cert.validity.notBefore = getCertNotBefore();
    cert.validity.notAfter = getCertNotAfter(cert.validity.notBefore);

    cert.setSubject(attributes);
    cert.setIssuer(caCert.subject.attributes);
    cert.setExtensions(extensions);

    cert.sign(caKey, forge.md.sha256.create());

    const pemCert = forge.pki.certificateToPem(cert);
    const pemPrivateKey = forge.pki.privateKeyToPem(keyPairs.privateKey);

    const certFilePath = configService.HOST_CERT_FILE;
    const privateKeyFilePath = configService.HOST_KEY_FILE;

    writeFileSync(certFilePath, pemCert);
    writeFileSync(privateKeyFilePath, pemPrivateKey);

    return { cert: pemCert, certPath: certFilePath, key: pemPrivateKey, keyPath: privateKeyFilePath };
  }

  static requiredAddresses(): string[] {
    const configService = container.resolve<ConfigService>('configService');
    const addresses = new Set<string>(['127.0.0.1']);

    for (const { address, isPrivate } of fetchViableNetworkAddresses()) {
      if (isPrivate) addresses.add(address);
    }

    const serverInfo = storedServerInfo();
    if (serverInfo) {
      for (const address of serverInfo.serverAddresses ?? []) {
        addresses.add(address);
      }

      const localHost = hostOfUrl(serverInfo.localUrl);
      if (localHost) {
        addresses.add(localHost);
      }
    }

    const workersConfig = configService.config.workers;
    if (workersConfig?.enabled && workersConfig.address) {
      addresses.add(workersConfig.address);
    }

    return [...addresses];
  }

  static generateCert(forceNew?: boolean): Certificates {
    const configService = container.resolve<ConfigService>('configService');
    const certFile = configService.HOST_CERT_FILE;
    const keyFile = configService.HOST_KEY_FILE;
    const caFile = configService.ROOT_CERT_FILE;

    const requiredAddresses = CertificateGeneration.requiredAddresses();

    const certExists = existsSync(certFile) && existsSync(keyFile) && existsSync(caFile);
    const certIsValid = certExists && isCertificateValid(certFile) && isCertificateValid(caFile);
    const isLegacy = certExists && isLegacyCertificate(certFile) && getCertAltNames(certFile).length === 0;

    if (!certExists || !certIsValid || isLegacy || forceNew) {
      logCertificate(`Issuing a new root CA and host certificate for ${requiredAddresses.join(', ')}`);
      const CA = CertificateGeneration.createRootCA(requiredAddresses);
      const hostCert = CertificateGeneration.createHostCert(requiredAddresses, CA);

      return {
        ...hostCert,
        ca: CA.cert,
        caPath: CA.certPath,
      };
    }

    // Keep the root CA (paired workers pin it) but re-issue the host cert
    // when a required address is missing from its SANs.
    const rootKeyPath = configService.ROOT_KEY_FILE;
    const altNames = getCertAltNames(certFile);
    const missingSans = requiredAddresses.filter((address) => !altNames.includes(address));

    if (missingSans.length > 0 && existsSync(rootKeyPath)) {
      logCertificate(`Re-issuing the host certificate, not yet covered: ${missingSans.join(', ')}. Browsers that stored an exception will ask again.`);
      const CA: Certificate = {
        cert: readFileSync(caFile, 'utf8'),
        certPath: caFile,
        key: readFileSync(rootKeyPath, 'utf8'),
        keyPath: rootKeyPath,
      };

      const hostCert = CertificateGeneration.createHostCert(requiredAddresses, CA);

      return {
        ...hostCert,
        ca: CA.cert,
        caPath: CA.certPath,
      };
    }

    return {
      cert: readFileSync(certFile, 'utf8'),
      certPath: certFile,
      key: readFileSync(keyFile, 'utf8'),
      keyPath: keyFile,
      ca: readFileSync(caFile, 'utf8'),
      caPath: caFile,
    };
  }
}
