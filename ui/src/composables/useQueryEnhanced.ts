import type { UseQueryOptions, UseQueryReturnType } from '@tanstack/vue-query';

type UseQueryEnhancedReturn<TData, TError> = UseQueryReturnType<TData, TError> & {
  isBusy: Ref<boolean>;
};

export function useQueryEnhanced<TData = unknown, TError = Error>(options: UseQueryOptions<TData, TError>): UseQueryEnhancedReturn<TData, TError> {
  const query = useQuery(options);

  const loading = computed(() => {
    if (query.data.value !== undefined) return query.isFetching.value || query.isPaused.value;
    return query.fetchStatus.value !== 'idle' || query.isError.value;
  });

  return {
    ...query,
    isLoading: loading,
    isBusy: loading,
  } as unknown as UseQueryEnhancedReturn<TData, TError>;
}
