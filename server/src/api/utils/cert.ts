import { fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { AsnConvert } from '@peculiar/asn1-schema';
import {
  AlgorithmIdentifier,
  Certificate as AsnCertificate,
  Extension as AsnExtension,
  Name as AsnName,
  Extensions,
  SubjectPublicKeyInfo,
  TBSCertificate,
  Validity,
  Version,
} from '@peculiar/asn1-x509';
import {
  AuthorityKeyIdentifierExtension,
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  Name,
  PemConverter,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  X509Certificate,
} from '@peculiar/x509';
import { createHash, createPrivateKey, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { container } from 'tsyringe';

import { ServerService } from '../services/server.service.js';
import { DEFAULTS } from './constants.js';

import type { Extension } from '@peculiar/x509';
import type { KeyObject } from 'node:crypto';
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

const SHA256_WITH_RSA = '1.2.840.113549.1.1.11';
const EKU_SERVER_AUTH = '1.3.6.1.5.5.7.3.1';
const EKU_CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const DER_NULL = new Uint8Array([0x05, 0x00]);

function randomSerialNumber(): ArrayBuffer {
  const serial = new Uint8Array(randomBytes(20));
  serial[0] = serial[0] & 0x7f || 0x01;
  return serial.buffer;
}

function signatureAlgorithm(): AlgorithmIdentifier {
  return new AlgorithmIdentifier({ algorithm: SHA256_WITH_RSA, parameters: DER_NULL.buffer });
}

function keyIdentifierOf(publicKey: ArrayBuffer): string {
  const info = AsnConvert.parse(publicKey, SubjectPublicKeyInfo);
  return createHash('sha1').update(Buffer.from(info.subjectPublicKey)).digest('hex');
}

function distinguishedName(commonName: string, organizationalUnit?: string): string {
  const parts = [`C=${DEFAULTS.C}`, `ST=${DEFAULTS.ST}`, `L=${DEFAULTS.L}`, `CN=${commonName}`, `O=${DEFAULTS.O}`];
  if (organizationalUnit) {
    parts.push(`OU=${organizationalUnit}`);
  }
  return parts.join(', ');
}

function subjectAltNames(customAddresses: string[]): SubjectAlternativeNameExtension {
  const addresses = new Set(customAddresses);
  addresses.add('127.0.0.1');

  return new SubjectAlternativeNameExtension(
    [...addresses].map((address) => ({ type: isIPv4(address) || isIPv6(address) ? ('ip' as const) : ('dns' as const), value: address })),
  );
}

function issueCertificate(params: {
  subject: string;
  issuer: AsnName;
  publicKey: ArrayBuffer;
  signingKey: KeyObject;
  notBefore: Date;
  notAfter: Date;
  extensions: Extension[];
}): string {
  const algorithm = signatureAlgorithm();
  const tbs = new TBSCertificate({
    version: Version.v3,
    serialNumber: randomSerialNumber(),
    signature: algorithm,
    issuer: params.issuer,
    validity: new Validity({ notBefore: params.notBefore, notAfter: params.notAfter }),
    subject: AsnConvert.parse(new Name(params.subject).toArrayBuffer(), AsnName),
    subjectPublicKeyInfo: AsnConvert.parse(params.publicKey, SubjectPublicKeyInfo),
    extensions: new Extensions(params.extensions.map((extension) => AsnConvert.parse(extension.rawData, AsnExtension))),
  });

  const signature = createSign('sha256')
    .update(Buffer.from(AsnConvert.serialize(tbs)))
    .sign(params.signingKey);
  const certificate = new AsnCertificate({
    tbsCertificate: tbs,
    signatureAlgorithm: algorithm,
    signatureValue: new Uint8Array(signature).buffer,
  });

  return PemConverter.encode(AsnConvert.serialize(certificate), 'CERTIFICATE');
}

function generateRsaKey(): { privateKeyPem: string; privateKey: KeyObject; publicKey: ArrayBuffer } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    privateKey,
    publicKey: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })).buffer,
  };
}

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

function readCertificate(certPath: string): X509Certificate {
  return new X509Certificate(readFileSync(certPath, 'utf8'));
}

function isCertificateValid(certPath: string): boolean {
  const cert = readCertificate(certPath);
  const now = new Date();
  return now >= cert.notBefore && now <= cert.notAfter;
}

function getCertAltNames(certPath: string): string[] {
  try {
    const extension = readCertificate(certPath).getExtension(SubjectAlternativeNameExtension);
    return (extension?.names.items ?? []).map((name) => name.value).filter(Boolean);
  } catch {
    return [];
  }
}

function isLegacyCertificate(certPath: string): boolean {
  try {
    const subject = readCertificate(certPath).subjectName;

    const organization = subject.getField('O')[0];
    const unit = subject.getField('OU')[0];
    const commonName = subject.getField('CN')[0];

    return organization === 'camera.ui' && unit === 'cui' && !!commonName && (commonName === 'camera.ui root certificate' || commonName.startsWith('camera.ui'));
  } catch (error) {
    console.error('Error checking legacy certificate:', error);
    return false;
  }
}

export class CertificateGeneration {
  static createRootCA(customAddresses: string[]): Certificate {
    const configService = container.resolve<ConfigService>('configService');

    const { privateKeyPem, privateKey, publicKey } = generateRsaKey();
    const keyId = keyIdentifierOf(publicKey);
    const subject = distinguishedName(DEFAULTS.ROOT_CN, DEFAULTS.OU);
    const notBefore = getCertNotBefore();

    const pemCert = issueCertificate({
      subject,
      issuer: AsnConvert.parse(new Name(subject).toArrayBuffer(), AsnName),
      publicKey,
      signingKey: privateKey,
      notBefore,
      notAfter: getCANotAfter(notBefore),
      extensions: [
        new BasicConstraintsExtension(true, undefined, true),
        // prettier-ignore
        new KeyUsagesExtension(
          KeyUsageFlags.keyCertSign |
          KeyUsageFlags.cRLSign |
          KeyUsageFlags.digitalSignature |
          KeyUsageFlags.nonRepudiation |
          KeyUsageFlags.keyEncipherment |
          KeyUsageFlags.dataEncipherment,
          true,
        ),
        new SubjectKeyIdentifierExtension(keyId),
        new AuthorityKeyIdentifierExtension(keyId),
        subjectAltNames(customAddresses),
      ],
    });

    const pemPrivateKey = privateKeyPem;

    const rootCertFilePath = configService.ROOT_CERT_FILE;
    const rootPrivateKeyFilePath = configService.ROOT_KEY_FILE;

    writeFileSync(rootCertFilePath, pemCert);
    writeFileSync(rootPrivateKeyFilePath, pemPrivateKey);

    return { cert: pemCert, certPath: rootCertFilePath, key: pemPrivateKey, keyPath: rootPrivateKeyFilePath };
  }

  static createHostCert(customAddresses: string[], rootCAObject: Certificate): Certificate {
    const configService = container.resolve<ConfigService>('configService');

    const caCert = new X509Certificate(rootCAObject.cert);
    const caKey = createPrivateKey(rootCAObject.key);
    const caKeyId = caCert.getExtension(SubjectKeyIdentifierExtension)?.keyId ?? keyIdentifierOf(caCert.publicKey.rawData);

    const { privateKeyPem, publicKey } = generateRsaKey();
    const notBefore = getCertNotBefore();

    const pemCert = issueCertificate({
      subject: distinguishedName(DEFAULTS.CN),
      issuer: AsnConvert.parse(caCert.subjectName.toArrayBuffer(), AsnName),
      publicKey,
      signingKey: caKey,
      notBefore,
      notAfter: getCertNotAfter(notBefore),
      extensions: [
        new BasicConstraintsExtension(false),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment, true),
        new ExtendedKeyUsageExtension([EKU_SERVER_AUTH, EKU_CLIENT_AUTH], true),
        new SubjectKeyIdentifierExtension(keyIdentifierOf(publicKey)),
        new AuthorityKeyIdentifierExtension(caKeyId),
        subjectAltNames(customAddresses),
      ],
    });

    const pemPrivateKey = privateKeyPem;

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
