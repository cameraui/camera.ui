import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type {
  AssistantHydration,
  AssistantInfo,
  AssistantModelsResult,
  AssistantSearchResult,
  AssistantStatus,
  AssistantTestResult,
  AssistantThreadSummary,
  AssistantUsageRow,
  CreateAssistantProfileInput,
  CreateAssistantScheduleInput,
  DBAssistantMemoryFact,
  DBAssistantProfile,
  DBAssistantSchedule,
  DBAssistantThread,
  PatchAssistantInput,
  PatchAssistantProfileInput,
  PatchAssistantScheduleInput,
  TestAssistantInput,
} from '@shared/types';
import type { UIMessage } from '@tanstack/ai';
import type { AxiosResponse } from 'axios';

export async function getAssistantInfo({ signal }: { signal: AbortSignal }): Promise<AssistantInfo> {
  const response: AxiosResponse<AssistantInfo> = await api.get('/assistant', { signal });
  return response.data;
}

export async function getAssistantStatus({ signal }: { signal?: AbortSignal } = {}): Promise<AssistantStatus> {
  const response: AxiosResponse<AssistantStatus> = await api.get('/assistant/status', { signal });
  return response.data;
}

export async function patchAssistantInfo(patch: PatchAssistantInput): Promise<AssistantInfo> {
  const response: AxiosResponse<AssistantInfo> = await api.patch('/assistant', patch);
  return response.data;
}

export async function testAssistant(patch: TestAssistantInput): Promise<AssistantTestResult> {
  const response: AxiosResponse<AssistantTestResult> = await api.post('/assistant/test', patch);
  return response.data;
}

export async function listAssistantModels(patch: TestAssistantInput): Promise<AssistantModelsResult> {
  const response: AxiosResponse<AssistantModelsResult> = await api.post('/assistant/models', patch);
  return response.data;
}

export async function listAssistantThreads({ signal }: { signal: AbortSignal }): Promise<AssistantThreadSummary[]> {
  const response: AxiosResponse<AssistantThreadSummary[]> = await api.get('/assistant/threads', { signal });
  return response.data;
}

export async function getAssistantThread(threadId: string, { signal }: { signal?: AbortSignal } = {}): Promise<DBAssistantThread> {
  const response: AxiosResponse<DBAssistantThread> = await api.get(`/assistant/threads/${encodeURIComponent(threadId)}`, { signal });
  return response.data;
}

export async function renameAssistantThread(threadId: string, title: string): Promise<DBAssistantThread> {
  const response: AxiosResponse<DBAssistantThread> = await api.patch(`/assistant/threads/${encodeURIComponent(threadId)}`, { title });
  return response.data;
}

export async function hydrateAssistantThread(threadId: string): Promise<AssistantHydration> {
  const response: AxiosResponse<AssistantHydration> = await api.get('/assistant/chat', { params: { threadId } });
  return response.data;
}

export async function cancelAssistantRun(runId: string): Promise<void> {
  await api.post('/assistant/chat/cancel', { runId });
}

export async function searchAssistantFilters(text: string, language: string, timezone: string): Promise<AssistantSearchResult> {
  const response: AxiosResponse<AssistantSearchResult> = await api.post('/assistant/search', { text, language, timezone });
  return response.data;
}

export async function replaceAssistantThreadMessages(threadId: string, messages: UIMessage[]): Promise<DBAssistantThread> {
  const response: AxiosResponse<DBAssistantThread> = await api.put(`/assistant/threads/${encodeURIComponent(threadId)}/messages`, { messages });
  return response.data;
}

export async function branchAssistantThread(threadId: string, until: number): Promise<DBAssistantThread> {
  const response: AxiosResponse<DBAssistantThread> = await api.post(`/assistant/threads/${encodeURIComponent(threadId)}/branch`, { until });
  return response.data;
}

export async function deleteAssistantThread(threadId: string): Promise<void> {
  await api.delete(`/assistant/threads/${encodeURIComponent(threadId)}`);
}

export async function deleteAllAssistantThreads(): Promise<void> {
  await api.delete('/assistant/threads');
}

export async function getAssistantUsage({ signal }: { signal: AbortSignal }): Promise<AssistantUsageRow[]> {
  const response: AxiosResponse<AssistantUsageRow[]> = await api.get('/assistant/usage', { signal });
  return response.data;
}

export async function getAssistantUsageAll({ signal }: { signal: AbortSignal }): Promise<AssistantUsageRow[]> {
  const response: AxiosResponse<AssistantUsageRow[]> = await api.get('/assistant/usage/all', { signal });
  return response.data;
}

export async function listAssistantMemory({ signal }: { signal: AbortSignal }): Promise<DBAssistantMemoryFact[]> {
  const response: AxiosResponse<DBAssistantMemoryFact[]> = await api.get('/assistant/memory', { signal });
  return response.data;
}

export async function deleteAssistantMemoryFact(factId: string): Promise<void> {
  await api.delete(`/assistant/memory/${encodeURIComponent(factId)}`);
}

export async function deleteAssistantMemory(): Promise<void> {
  await api.delete('/assistant/memory');
}

export async function listAssistantProfiles({ signal }: { signal: AbortSignal }): Promise<DBAssistantProfile[]> {
  const response: AxiosResponse<DBAssistantProfile[]> = await api.get('/assistant/profiles', { signal });
  return response.data;
}

export async function createAssistantProfile(input: CreateAssistantProfileInput): Promise<DBAssistantProfile> {
  const response: AxiosResponse<DBAssistantProfile> = await api.post('/assistant/profiles', input);
  return response.data;
}

export async function patchAssistantProfile(profileId: string, patch: PatchAssistantProfileInput): Promise<DBAssistantProfile> {
  const response: AxiosResponse<DBAssistantProfile> = await api.patch(`/assistant/profiles/${encodeURIComponent(profileId)}`, patch);
  return response.data;
}

export async function deleteAssistantProfile(profileId: string): Promise<void> {
  await api.delete(`/assistant/profiles/${encodeURIComponent(profileId)}`);
}

export type AssistantScheduleRow = DBAssistantSchedule & { nextRun: number | null };

export async function listAssistantSchedules({ signal }: { signal: AbortSignal }): Promise<AssistantScheduleRow[]> {
  const response: AxiosResponse<AssistantScheduleRow[]> = await api.get('/assistant/schedules', { signal });
  return response.data;
}

export async function createAssistantSchedule(input: CreateAssistantScheduleInput): Promise<DBAssistantSchedule> {
  const response: AxiosResponse<DBAssistantSchedule> = await api.post('/assistant/schedules', input);
  return response.data;
}

export async function patchAssistantSchedule(scheduleId: string, patch: PatchAssistantScheduleInput): Promise<DBAssistantSchedule> {
  const response: AxiosResponse<DBAssistantSchedule> = await api.patch(`/assistant/schedules/${encodeURIComponent(scheduleId)}`, patch);
  return response.data;
}

export async function deleteAssistantSchedule(scheduleId: string): Promise<void> {
  await api.delete(`/assistant/schedules/${encodeURIComponent(scheduleId)}`);
}

export async function runAssistantSchedule(scheduleId: string): Promise<DBAssistantSchedule> {
  const response: AxiosResponse<DBAssistantSchedule> = await api.post(`/assistant/schedules/${encodeURIComponent(scheduleId)}/run`);
  return response.data;
}

export class AssistantQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  get queryClient() {
    return this._queryClient;
  }

  public getAssistantInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant'],
      queryFn: ({ signal }) => getAssistantInfo({ signal }),
      staleTime: 1000,
    });
  }

  public getAssistantStatusQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant', 'status'],
      queryFn: ({ signal }) => getAssistantStatus({ signal }),
      staleTime: 60_000,
    });
  }

  public patchAssistantInfoMutation() {
    return useMutation({
      mutationFn: patchAssistantInfo,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant'], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'status'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.assistant_updated'), life: 3000 });
      },
    });
  }

  public testAssistantMutation() {
    return useMutation({ mutationFn: testAssistant });
  }

  public listAssistantModelsMutation() {
    return useMutation({ mutationFn: listAssistantModels });
  }

  public listThreadsQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant', 'threads'],
      queryFn: ({ signal }) => listAssistantThreads({ signal }),
      staleTime: 1000,
    });
  }

  public renameThreadMutation() {
    return useMutation({
      mutationFn: ({ threadId, title }: { threadId: string; title: string }) => renameAssistantThread(threadId, title),
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'threads'], exact: true });
      },
    });
  }

  public deleteThreadMutation() {
    return useMutation({
      mutationFn: deleteAssistantThread,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'threads'], exact: true });
      },
    });
  }

  public usageAllQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant', 'usage', 'all'],
      queryFn: ({ signal }) => getAssistantUsageAll({ signal }),
      staleTime: 30_000,
    });
  }

  public memoryQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant', 'memory'],
      queryFn: ({ signal }) => listAssistantMemory({ signal }),
      staleTime: 5000,
    });
  }

  public deleteMemoryFactMutation() {
    return useMutation({
      mutationFn: deleteAssistantMemoryFact,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'memory'], exact: true });
      },
    });
  }

  public deleteMemoryMutation() {
    return useMutation({
      mutationFn: deleteAssistantMemory,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'memory'], exact: true });
      },
    });
  }

  public listProfilesQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant', 'profiles'],
      queryFn: ({ signal }) => listAssistantProfiles({ signal }),
      staleTime: 5000,
    });
  }

  public createProfileMutation() {
    return useMutation({
      mutationFn: createAssistantProfile,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'profiles'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.assistant_profile_saved'), life: 3000 });
      },
    });
  }

  public patchProfileMutation() {
    return useMutation({
      mutationFn: ({ profileId, patch }: { profileId: string; patch: PatchAssistantProfileInput }) => patchAssistantProfile(profileId, patch),
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'profiles'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.assistant_profile_saved'), life: 3000 });
      },
    });
  }

  public deleteProfileMutation() {
    return useMutation({
      mutationFn: deleteAssistantProfile,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'profiles'], exact: true });
      },
    });
  }

  public listSchedulesQuery() {
    return useQueryEnhanced({
      queryKey: ['assistant', 'schedules'],
      queryFn: ({ signal }) => listAssistantSchedules({ signal }),
      staleTime: 1000,
    });
  }

  public createScheduleMutation() {
    return useMutation({
      mutationFn: createAssistantSchedule,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'schedules'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.assistant_schedule_saved'), life: 3000 });
      },
    });
  }

  public patchScheduleMutation() {
    return useMutation({
      mutationFn: ({ scheduleId, patch }: { scheduleId: string; patch: PatchAssistantScheduleInput }) => patchAssistantSchedule(scheduleId, patch),
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'schedules'], exact: true });
      },
    });
  }

  public deleteScheduleMutation() {
    return useMutation({
      mutationFn: deleteAssistantSchedule,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'schedules'], exact: true });
      },
    });
  }

  public runScheduleMutation() {
    return useMutation({
      mutationFn: runAssistantSchedule,
      onSuccess: async (schedule) => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'schedules'], exact: true });
        const failed = schedule.lastRun?.status === 'error';
        this.toast.add({
          severity: failed ? 'error' : 'success',
          detail: failed
            ? this.t('components.toast.assistant_schedule_failed', { message: schedule.lastRun?.message ?? '' })
            : this.t('components.toast.assistant_schedule_ran'),
          life: failed ? 6000 : 3000,
        });
      },
    });
  }

  public deleteAllThreadsMutation() {
    return useMutation({
      mutationFn: deleteAllAssistantThreads,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['assistant', 'threads'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.assistant_threads_deleted'), life: 3000 });
      },
    });
  }
}
