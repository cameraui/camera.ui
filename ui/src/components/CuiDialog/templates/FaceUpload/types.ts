export interface FaceUploadProps {
  onEnroll: (name: string, imageData: Uint8Array, facePluginName: string) => Promise<void>;
}

export interface FaceUploadPluginOption {
  label: string;
  value: string;
}

export const FACE_UPLOAD_ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
export const FACE_UPLOAD_MAX_FILE_SIZE_MB = 10;
export const FACE_UPLOAD_MAX_FILE_SIZE = FACE_UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;
