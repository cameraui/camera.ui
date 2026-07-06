import forge from 'node-forge';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { join } from 'node:path';
import { container } from 'tsyringe';

import { DEFAULTS, HOST_CERT_FILENAME, HOST_KEY_FILENAME, OLD_ROOT_CERT_FILENAME, OLD_ROOT_KEY_FILENAME, ROOT_CERT_FILENAME, ROOT_KEY_FILENAME } from './constants.js';

import type { ConfigService } from '../../services/config/index.js';

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

    const rootCertFilePath = join(configService.STORAGE_PATH, ROOT_CERT_FILENAME);
    const rootPrivateKeyFilePath = join(configService.STORAGE_PATH, ROOT_KEY_FILENAME);

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

    const certFilePath = join(configService.STORAGE_PATH, HOST_CERT_FILENAME);
    const privateKeyFilePath = join(configService.STORAGE_PATH, HOST_KEY_FILENAME);

    writeFileSync(certFilePath, pemCert);
    writeFileSync(privateKeyFilePath, pemPrivateKey);

    return { cert: pemCert, certPath: certFilePath, key: pemPrivateKey, keyPath: privateKeyFilePath };
  }

  static generateCert(forceNew?: boolean): Certificates {
    const configService = container.resolve<ConfigService>('configService');
    const sslConfig = configService.config.ssl;

    // Workers verify the leaf TLS connection against this cert — the master
    // address they dial must be covered by a SAN.
    const requiredAddresses = [...(sslConfig.addresses ?? [])];
    const workersConfig = configService.config.workers;
    if (workersConfig?.enabled && workersConfig.address && !requiredAddresses.includes(workersConfig.address)) {
      requiredAddresses.push(workersConfig.address);
    }

    const certExists = existsSync(sslConfig.certFile) && existsSync(sslConfig.keyFile) && existsSync(sslConfig.caFile);
    const certIsValid = certExists && isCertificateValid(sslConfig.certFile) && isCertificateValid(sslConfig.caFile);
    const isLegacy =
      (certExists && isLegacyCertificate(sslConfig.certFile)) ||
      sslConfig.certFile.endsWith(OLD_ROOT_CERT_FILENAME) ||
      sslConfig.certFile.endsWith(OLD_ROOT_KEY_FILENAME);

    if (!certExists || !certIsValid || isLegacy || forceNew) {
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
    const rootKeyPath = join(configService.STORAGE_PATH, ROOT_KEY_FILENAME);
    const altNames = getCertAltNames(sslConfig.certFile);
    const missingSans = requiredAddresses.filter((address) => !altNames.includes(address));

    if (missingSans.length > 0 && existsSync(rootKeyPath)) {
      const CA: Certificate = {
        cert: readFileSync(sslConfig.caFile, 'utf8'),
        certPath: sslConfig.caFile,
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
      cert: readFileSync(sslConfig.certFile, 'utf8'),
      certPath: sslConfig.certFile,
      key: readFileSync(sslConfig.keyFile, 'utf8'),
      keyPath: sslConfig.keyFile,
      ca: readFileSync(sslConfig.caFile, 'utf8'),
      caPath: sslConfig.caFile,
    };
  }
}
