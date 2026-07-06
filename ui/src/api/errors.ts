import type { AxiosError } from 'axios';

const TUNNEL_ERROR_PATTERNS = ['Tunnel unavailable'];

export interface CameraUiErrorBody {
  message?: string | { name?: string };
  redirect?: string;
}

export function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error;
}

export function readErrorBody(error: AxiosError): CameraUiErrorBody | undefined {
  return error?.response?.data as CameraUiErrorBody | undefined;
}

export function readErrorMessage(error: AxiosError): string | undefined {
  const body = readErrorBody(error);
  if (typeof body?.message === 'string') return body.message;
  return undefined;
}

export function isTunnelPendingError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.response?.status !== 503) return false;
  const message = readErrorMessage(error);
  if (!message) return false;
  return TUNNEL_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function isServerGoneError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  return error.response?.status === 404 && readErrorMessage(error) === 'Server not found';
}

export function isRemoteDisabledError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  return error.response?.status === 503 && readErrorMessage(error) === 'Server remote access is disabled';
}
