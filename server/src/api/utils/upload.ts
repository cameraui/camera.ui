import type { MultipartFile } from '@fastify/multipart';
import * as zod from 'zod';

function isMultipartFile(x: any): x is MultipartFile {
  return x.mimetype !== undefined;
}

function getFileSize(file: MultipartFile | File): number {
  if (isMultipartFile(file)) {
    return Buffer.byteLength((file as any)._buf);
  }
  return file.size;
}

function getFileType(file: MultipartFile | File): string {
  if (isMultipartFile(file)) {
    return file.mimetype;
  }
  return file.type;
}

export function uploadSchema(maxSize: number, acceptedTypes: string[], sizeMessage: string, typeMessage: string) {
  return zod
    .custom<MultipartFile | File>()
    .refine((file) => getFileSize(file) <= maxSize, sizeMessage)
    .refine((file) => acceptedTypes.includes(getFileType(file)), typeMessage) as zod.ZodType<MultipartFile>;
}
