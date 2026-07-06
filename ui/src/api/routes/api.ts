import { axiosInstance as api } from '..';

import type { MethodKeys } from '@shared/types';
import type { AxiosResponse } from 'axios';

export interface ApiInfo {
  message: string;
  version: string;
  installedVersion?: string;
  restartRequired?: boolean;
  electron: boolean;
}

export async function apiInfo({ signal }: { signal: AbortSignal }): Promise<ApiInfo> {
  const response: AxiosResponse<ApiInfo> = await api.get('/', { signal });
  return response.data;
}

export class ApiQuery {
  private _queryClient = useQueryClient();

  private queryActivator = ref<{ name: MethodKeys<ApiQuery>; enabled: boolean }[]>([
    {
      name: 'apiInfoQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public apiInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['api'],
      queryFn: ({ signal }) => apiInfo({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'apiInfoQuery' && query.enabled),
    });
  }

  public toggleQueryActivator(name: MethodKeys<ApiQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
