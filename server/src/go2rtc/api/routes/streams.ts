import { assertResponseOk, fetchInstance } from '../instance.js';

import type { ProbeConfig } from '@camera.ui/sdk';
import type {
  CreateStreamData,
  Go2RTCPreload,
  Go2RTCProbe,
  HomeKitPairData,
  HomeKitPairResponse,
  SourceData,
  StreamStatusResponse,
  UnpairData,
  UpdateStreamData,
} from '../../types.js';
import type { RequestManager } from '../manager.js';

export class StreamsRoute {
  constructor(private requestManager: RequestManager) {}

  public async createStream(data: CreateStreamData): Promise<void> {
    const params = new URLSearchParams();
    params.set('name', data.name);

    data.src.forEach((src) => {
      if (/^\s*(exec|echo|expr):/i.test(src)) {
        throw new Error(`Refusing command-execution stream source: ${src.split(':')[0]}:`);
      }
      params.append('src', src);
    });

    const response = await this.requestManager.queuedRequest(`stream:${data.name}`, `createStream:${data.name}:${data.src.join(',')}`, () =>
      fetchInstance()(`/streams?${params}`, {
        method: 'PUT',
      }),
    );

    await assertResponseOk(response);
  }

  public async pairHomekit(data: HomeKitPairData): Promise<HomeKitPairResponse> {
    const { id, url, pin } = data;

    const newUrl = new URL(url);
    newUrl.searchParams.set('pin', pin);

    const formData = new FormData();
    formData.append('id', id);
    formData.append('url', newUrl.toString());

    const response = await this.requestManager.queuedRequest(`homekit:${id}`, `pairHomekit:${id}:${url}`, () =>
      fetchInstance()('/homekit', {
        method: 'POST',
        body: formData,
      }),
    );

    await assertResponseOk(response);

    const json: HomeKitPairResponse = (await response.json()) as any;

    return json;
  }

  public async unpairHomekit(data: UnpairData): Promise<void> {
    const params = new URLSearchParams();
    params.set('id', data.id);

    const response = await this.requestManager.queuedRequest(`homekit:${data.id}`, `unpairHomekit:${data.id}`, () =>
      fetchInstance()(`/homekit?${params}`, {
        method: 'DELETE',
      }),
    );

    await assertResponseOk(response);
  }

  public async deleteStream(data: SourceData): Promise<void> {
    const params = new URLSearchParams(data as any);
    const response = await this.requestManager.queuedRequest(`stream:${data.src}`, `deleteStream:${data.src}`, () =>
      fetchInstance()(`/streams?${params}`, {
        method: 'DELETE',
      }),
    );

    await assertResponseOk(response);
  }

  public async getStreamInfo(data: SourceData): Promise<Go2RTCProbe> {
    const params = new URLSearchParams(data as any);
    const response = await this.requestManager.queuedRequest(`stream:${data.src}`, `getStreamInfo:${data.src}`, () =>
      fetchInstance()(`/streams?${params}`, {
        method: 'GET',
      }),
    );

    await assertResponseOk(response);

    const json: Go2RTCProbe = (await response.json()) as any;

    return json;
  }

  public async updateStreamSource(data: UpdateStreamData): Promise<void> {
    const params = new URLSearchParams(data as any);
    const response = await this.requestManager.queuedRequest(`stream:${data.name}`, `updateStreamSource:${data.name}:${data.src}`, () =>
      fetchInstance()(`/streams?${params}`, {
        method: 'PATCH',
      }),
    );

    await assertResponseOk(response);
  }

  public async probeStreamSource(data: SourceData, probeData?: ProbeConfig): Promise<Go2RTCProbe> {
    const params = new URLSearchParams(data as any);

    const queryParts = [];
    const audioCodecs = [];

    if (probeData?.video) {
      queryParts.push('video');
    }

    if (Array.isArray(probeData?.audio)) {
      probeData.audio.forEach((audio) => {
        audioCodecs.push(audio);
      });
    } else if (typeof probeData?.audio === 'string') {
      audioCodecs.push(probeData?.audio);
    } else if (probeData?.audio) {
      queryParts.push('audio');
    }

    if (audioCodecs.length) {
      queryParts.push(`audio=${audioCodecs.join(',')}`);
    }

    if (probeData?.microphone) {
      queryParts.push('microphone');
    }

    if (!queryParts.length) {
      queryParts.push('video', 'audio');
    }

    const queryString = `${params}&${queryParts.join('&')}`;
    const cacheKey = `probeStreamSource:${data.src}:${queryParts.join(':')}`;

    const response = await this.requestManager.queuedRequest(`stream:${data.src}`, cacheKey, () =>
      fetchInstance()(`/streams?${queryString}`, {
        method: 'GET',
      }),
    );

    await assertResponseOk(response);

    const json: Go2RTCProbe = (await response.json()) as any;

    return json;
  }

  public async getPreloadStream(data: SourceData): Promise<Go2RTCPreload> {
    const params = new URLSearchParams(data as any);
    const response = await this.requestManager.queuedRequest(`preload:${data.src}`, `getPreloadStream:${data.src}`, () =>
      fetchInstance()(`/preload?${params}`, {
        method: 'GET',
      }),
    );

    await assertResponseOk(response);

    const json: Go2RTCPreload = (await response.json()) as any;

    return json;
  }

  public async addPreloadStream(data: SourceData, probeData?: ProbeConfig): Promise<void> {
    const params = new URLSearchParams(data as any);

    const queryParts = [];
    const audioCodecs = [];

    if (probeData?.video) {
      queryParts.push('video');
    }

    if (Array.isArray(probeData?.audio)) {
      probeData.audio.forEach((audio) => {
        audioCodecs.push(audio);
      });
    } else if (typeof probeData?.audio === 'string') {
      audioCodecs.push(probeData?.audio);
    } else if (probeData?.audio) {
      queryParts.push('audio');
    }

    if (audioCodecs.length) {
      queryParts.push(`audio=${audioCodecs.join(',')}`);
    }

    if (probeData?.microphone) {
      queryParts.push('microphone');
    }

    if (!queryParts.length) {
      queryParts.push('video', 'audio');
    }

    const queryString = `${params}&${queryParts.join('&')}`;
    const cacheKey = `addPreloadStream:${data.src}:${queryParts.join(':')}`;

    const response = await this.requestManager.queuedRequest(`preload:${data.src}`, cacheKey, () =>
      fetchInstance()(`/preload?${queryString}`, {
        method: 'PUT',
      }),
    );

    await assertResponseOk(response);
  }

  public async getStreamsStatus(): Promise<StreamStatusResponse> {
    const response = await this.requestManager.deduplicatedRequest('streamsStatus', () => fetchInstance()('/streams/status', { method: 'GET' }));

    if (!response.ok) {
      throw new Error((await response.text()) ?? response.statusText);
    }

    return response.json() as any;
  }

  public async deletePreloadStream(data: SourceData): Promise<void> {
    const params = new URLSearchParams(data as any);
    const response = await this.requestManager.queuedRequest(`preload:${data.src}`, `deletePreloadStream:${data.src}`, () =>
      fetchInstance()(`/preload?${params}`, {
        method: 'DELETE',
      }),
    );

    await assertResponseOk(response);
  }

  public async killConsumersByTag(tag: string): Promise<number> {
    const params = new URLSearchParams({ tag });
    const response = await fetchInstance()(`/consumer?${params}`, {
      method: 'DELETE',
    });

    if (response.status === 404) {
      return 0;
    }

    await assertResponseOk(response);

    const json = (await response.json()) as { killed?: number };
    return json.killed ?? 0;
  }
}
