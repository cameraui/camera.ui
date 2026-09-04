import { axiosInstance as api } from '..';

import type {
  DBTrainingCandidate,
  DBTrainingSettings,
  TrainingCandidateListQuery,
  TrainingCandidatePatchInput,
  TrainingSettingsPatchInput,
  TrainingSubmission,
  TrainingSubmitResult,
} from '@shared/types';
import type { AxiosResponse } from 'axios';

export async function getTrainingCandidates(params: TrainingCandidateListQuery = {}, { signal }: { signal?: AbortSignal } = {}): Promise<DBTrainingCandidate[]> {
  const response: AxiosResponse<DBTrainingCandidate[]> = await api.get('/training/candidates', { params, signal });
  return response.data;
}

export async function patchTrainingCandidate(id: string, patch: TrainingCandidatePatchInput): Promise<DBTrainingCandidate> {
  const response: AxiosResponse<DBTrainingCandidate> = await api.patch(`/training/candidates/${id}`, patch);
  return response.data;
}

export async function deleteTrainingCandidate(id: string): Promise<void> {
  await api.delete(`/training/candidates/${id}`);
}

export async function submitTrainingCandidates(ids: string[]): Promise<TrainingSubmitResult> {
  const response: AxiosResponse<TrainingSubmitResult> = await api.post('/training/candidates/submit', { ids });
  return response.data;
}

export async function getTrainingSubmissions({ signal }: { signal?: AbortSignal } = {}): Promise<TrainingSubmission[]> {
  const response: AxiosResponse<TrainingSubmission[]> = await api.get('/training/submissions', { signal });
  return response.data;
}

export async function deleteTrainingSubmission(id: string): Promise<void> {
  await api.delete(`/training/submissions/${id}`);
}

export async function getTrainingSettings({ signal }: { signal?: AbortSignal } = {}): Promise<DBTrainingSettings> {
  const response: AxiosResponse<DBTrainingSettings> = await api.get('/training/settings', { signal });
  return response.data;
}

export async function patchTrainingSettings(patch: TrainingSettingsPatchInput): Promise<DBTrainingSettings> {
  const response: AxiosResponse<DBTrainingSettings> = await api.patch('/training/settings', patch);
  return response.data;
}

export class TrainingQuery {
  private queryClient = useQueryClient();

  public getCandidatesQuery() {
    return useQueryEnhanced({
      queryKey: ['training-candidates'],
      queryFn: ({ signal }) => getTrainingCandidates({}, { signal }),
      staleTime: 5_000,
    });
  }

  public getSettingsQuery() {
    return useQueryEnhanced({
      queryKey: ['training-settings'],
      queryFn: ({ signal }) => getTrainingSettings({ signal }),
      staleTime: 30_000,
    });
  }

  public getSubmissionsQuery() {
    return useQueryEnhanced({
      queryKey: ['training-submissions'],
      queryFn: ({ signal }) => getTrainingSubmissions({ signal }),
      staleTime: 30_000,
      retry: false,
    });
  }

  public patchCandidateMutation() {
    return useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: TrainingCandidatePatchInput }) => patchTrainingCandidate(id, patch),
      onSuccess: async () => {
        await this.queryClient.refetchQueries({ queryKey: ['training-candidates'], exact: true });
      },
    });
  }

  public deleteCandidateMutation() {
    return useMutation({
      mutationFn: deleteTrainingCandidate,
      onSuccess: async () => {
        await this.queryClient.refetchQueries({ queryKey: ['training-candidates'], exact: true });
      },
    });
  }

  public deleteSubmissionMutation() {
    return useMutation({
      mutationFn: deleteTrainingSubmission,
      onSuccess: async () => {
        await this.queryClient.refetchQueries({ queryKey: ['training-submissions'], exact: true });
      },
    });
  }

  public submitCandidatesMutation() {
    return useMutation({
      mutationFn: submitTrainingCandidates,
      onSuccess: async () => {
        await this.queryClient.refetchQueries({ queryKey: ['training-candidates'], exact: true });
      },
    });
  }

  public patchSettingsMutation() {
    return useMutation({
      mutationFn: patchTrainingSettings,
      onSuccess: async () => {
        await this.queryClient.refetchQueries({ queryKey: ['training-settings'], exact: true });
      },
    });
  }
}
