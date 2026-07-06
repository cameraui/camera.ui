import { container } from 'tsyringe';
import { Agent, fetch as undiciFetch } from 'undici';

import type { ConfigService } from '../../services/config/index.js';

export function fetchInstance(isApi = true) {
  const configService = container.resolve<ConfigService>('configService');

  const GO2RTC_URL = configService.go2rtcAddress('api');
  const GO2RTC_USERNAME = configService.go2rtcConfig.api.username;
  const GO2RTC_PASSWORD = configService.go2rtcConfig.api.password;

  let baseURL = GO2RTC_URL;

  if (isApi) {
    baseURL += '/api';
  }

  const agent = new Agent({
    allowH2: false,
    connect: {
      cert: configService.ssl.cert,
      key: configService.ssl.key,
      ca: configService.ssl.ca,
      rejectUnauthorized: false,
    },
  });

  const fetchWithAuth = async (target: RequestInfo, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    headers.set('Authorization', `Basic ${Buffer.from(`${GO2RTC_USERNAME}:${GO2RTC_PASSWORD}`).toString('base64')}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    const targetUrl = target instanceof URL ? target.toString() : typeof target === 'string' ? target : target.url;

    try {
      return await undiciFetch(`${baseURL}${targetUrl}`, {
        ...options,
        headers,
        signal: controller.signal,
        dispatcher: agent,
      } as any);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return fetchWithAuth;
}

export async function assertResponseOk(response: { ok: boolean; status: number; statusText: string; text(): Promise<string> }): Promise<void> {
  if (response.ok) return;
  const message = (await response.text()) ?? `${response.statusText} (${response.status})`;
  throw new Error(message);
}
