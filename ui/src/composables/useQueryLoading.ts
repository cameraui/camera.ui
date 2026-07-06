interface QueryLoadingState {
  isLoading: Ref<boolean>;
  isPaused: Ref<boolean>;
}

export function useQueryLoading(...queries: QueryLoadingState[]): Ref<boolean> {
  return computed(() => {
    return queries.some((query) => query.isLoading.value || query.isPaused?.value);
  });
}
