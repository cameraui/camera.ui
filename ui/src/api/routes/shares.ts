import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export interface ShareData {
  _id: string;
  code: string;
  cameraId: string;
  sourceId: string;
  sourceName: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  maxViewers: number;
  currentViewers: number;
  totalViews: number;
  revoked: boolean;
  label?: string;
}

export interface ShareCreateResult {
  token: string;
  code: string;
  link: string;
  expiresAt: string;
}

export interface CreateShareInput {
  cameraId: string;
  sourceId: string;
  ttlHours: number;
  maxViewers: number;
  label?: string;
}

export async function createShareFn({ shareData }: { shareData: CreateShareInput }): Promise<ShareCreateResult> {
  const response: AxiosResponse<ShareCreateResult> = await api.post('/shares', shareData);
  return response.data;
}

export async function getSharesFn({ camera, signal }: { camera?: string; signal: AbortSignal }): Promise<ShareData[]> {
  const response: AxiosResponse<ShareData[]> = await api.get('/shares', { params: { camera }, signal });
  return response.data;
}

export async function revokeShareFn({ token }: { token: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete(`/shares/${token}`);
  return response.data;
}

export class SharesQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  get queryClient() {
    return this._queryClient;
  }

  public getSharesQuery(cameraId?: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['shares', cameraId],
      queryFn: ({ signal }) => getSharesFn({ camera: unref(cameraId), signal }),
    });
  }

  public createShareQuery() {
    return useMutation({
      mutationFn: createShareFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['shares'] });
        this.toast.add({ severity: 'success', detail: this.t('shares.share_created'), life: 3000 });
      },
    });
  }

  public revokeShareQuery() {
    return useMutation({
      mutationFn: revokeShareFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['shares'] });
        this.toast.add({ severity: 'success', detail: this.t('shares.share_revoked'), life: 3000 });
      },
    });
  }
}
