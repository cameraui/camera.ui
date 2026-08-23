export interface CertificateUploadProps {
  hasCertificate?: boolean;
}

export interface CertificateUploadResult {
  cert: File;
  key: File;
  chain?: File;
}
