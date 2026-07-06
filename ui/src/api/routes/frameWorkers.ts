import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { FrameWorkerResponse, MethodKeys, PaginationQuery } from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export async function getFrameWorkersFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<FrameWorkerResponse> {
  const response: AxiosResponse<FrameWorkerResponse> = await api.get('/frameworkers', { params: parameter, signal });
  return response.data;
}

export async function restartFrameWorkerFn({ frameWorkerName }: { frameWorkerName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/frameworkers/${frameWorkerName}/restart`);
  return response.data;
}

export class FrameWorkerQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<FrameWorkerQuery>; enabled: boolean }[]>([
    {
      name: 'getFrameWorkersQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public getFrameWorkersQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['frameWorkerList', pagination],
      queryFn: ({ signal }) => getFrameWorkersFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getFrameWorkersQuery' && query.enabled),
    });
  }

  public restartFrameWorkerQuery() {
    return useMutation({
      mutationFn: restartFrameWorkerFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['frameWorkers', variables.frameWorkerName] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.frame_worker_restarted'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<FrameWorkerQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
