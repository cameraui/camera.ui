import { fetchInstance } from '../instance.js';

import type { DeviceSource, DVRipSource, FFmpegSource, GoProSource, HassSource, HomeKitSource, OnvifSource, SourceData, WebtorrentSource } from '../../types.js';
import type { RequestManager } from '../manager.js';

export class DiscoverRoute {
  constructor(private requestManager: RequestManager) {}

  public async discoverHomekit(): Promise<{ sources: HomeKitSource[] }> {
    return this.requestManager.deduplicatedRequest('discoverHomekit', async () => {
      const response = await fetchInstance()('/discovery/homekit', {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<HomeKitSource, 'type'>[] };

      return {
        sources: res.sources
          .filter((s) => {
            const url = new URL(s.url);
            return url.searchParams.get('status') === '1';
          })
          .map((s): HomeKitSource => {
            return {
              ...s,
              type: 'HomeKit',
            };
          }),
      };
    });
  }

  public async discoverOnvif(data?: SourceData): Promise<{ sources: OnvifSource[] }> {
    let target = '/onvif';
    if (data) {
      const params = new URLSearchParams(data as any);
      target = `/onvif?${params}`;
    }

    const cacheKey = data ? `discoverOnvif:${data.src}` : 'discoverOnvif';

    return this.requestManager.deduplicatedRequest(cacheKey, async () => {
      const response = await fetchInstance()(target, {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<OnvifSource, 'type'>[] };

      return {
        sources: res.sources.map((s): OnvifSource => {
          return {
            ...s,
            type: 'Onvif',
          };
        }),
      };
    });
  }

  public async discoverDvrip(): Promise<{ sources: DVRipSource[] }> {
    return this.requestManager.deduplicatedRequest('discoverDvrip', async () => {
      const response = await fetchInstance()('/dvrip', {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<DVRipSource, 'type'>[] };

      return {
        sources: res.sources.map((s): DVRipSource => {
          return {
            ...s,
            type: 'DVRip',
          };
        }),
      };
    });
  }

  public async discoverHass(): Promise<{ sources: HassSource[] }> {
    return this.requestManager.deduplicatedRequest('discoverHass', async () => {
      const response = await fetchInstance()('/hass', {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<HassSource, 'type'>[] };

      return {
        sources: res.sources.map((s): HassSource => {
          return {
            ...s,
            type: 'Hass',
          };
        }),
      };
    });
  }

  public async discoverGopro(): Promise<{ sources: GoProSource[] }> {
    return this.requestManager.deduplicatedRequest('discoverGopro', async () => {
      const response = await fetchInstance()('/gopro', {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<GoProSource, 'type'>[] };

      return {
        sources: res.sources.map((s): GoProSource => {
          return {
            ...s,
            type: 'GoPro',
          };
        }),
      };
    });
  }

  public async discoverWebtorrent(): Promise<{ sources: WebtorrentSource[] }> {
    return this.requestManager.deduplicatedRequest('discoverWebtorrent', async () => {
      const response = await fetchInstance()('/webtorrent', {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<WebtorrentSource, 'type'>[] };

      return {
        sources: res.sources.map((s): WebtorrentSource => {
          return {
            ...s,
            type: 'Webtorrent',
          };
        }),
      };
    });
  }

  public async discoverFFmpeg(): Promise<{ sources: FFmpegSource[] }> {
    return this.requestManager.deduplicatedRequest('discoverFFmpeg', async () => {
      const response = await fetchInstance()('/ffmpeg/devices', {
        method: 'GET',
      });

      if (!response.ok) {
        return { sources: [] };
      }

      const res = (await response.json()) as { sources: Omit<FFmpegSource, 'type'>[] };

      return {
        sources: res.sources.map((s): FFmpegSource => {
          return {
            ...s,
            type: 'FFmpeg',
          };
        }),
      };
    });
  }

  public async discoverSources(): Promise<{ sources: DeviceSource[] }> {
    const sources = await Promise.all([this.discoverHomekit(), this.discoverOnvif(), this.discoverDvrip(), this.discoverHass(), this.discoverGopro()]);

    return {
      sources: sources.reduce<DeviceSource[]>((acc, { sources }) => [...acc, ...sources], []),
    };
  }
}
