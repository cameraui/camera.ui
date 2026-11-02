import type { SimilarSearchRequest } from '@/components/CuiSimilarPicker/types.js';

export function useSimilarSearchRoute() {
  const router = useRouter();
  const route = useRoute();

  const requests = computed<SimilarSearchRequest[]>(() => {
    if (!route.query.similar || !hasPermission(undefined, 'admin')) return [];
    const state = window.history.state as { similar?: SimilarSearchRequest | SimilarSearchRequest[] } | null;
    return [state?.similar ?? []].flat().filter((request) => request.query);
  });

  function openSimilarSearch(next: SimilarSearchRequest | SimilarSearchRequest[]): void {
    router.push({
      path: '/recordings',
      query: { similar: Date.now().toString(36) },
      state: { similar: JSON.parse(JSON.stringify(next)) },
    });
  }

  function closeSimilarSearch(): void {
    const query = { ...route.query };
    delete query.similar;
    router.replace({ query });
  }

  function openOnCamera(cameraName: string, timestamp: number, next: SimilarSearchRequest): void {
    router.push({
      path: `/cameras/${encodeURIComponent(cameraName)}`,
      query: { startTs: String(timestamp) },
      state: { similar: JSON.parse(JSON.stringify(next)) },
    });
  }

  function cameraSearch(): SimilarSearchRequest | undefined {
    if (!hasPermission(undefined, 'admin')) return undefined;
    const state = window.history.state as { similar?: SimilarSearchRequest } | null;
    return state?.similar?.query ? state.similar : undefined;
  }

  function forgetCameraSearch(): void {
    window.history.replaceState({ ...window.history.state, similar: undefined }, '');
  }

  return { requests, openSimilarSearch, closeSimilarSearch, openOnCamera, cameraSearch, forgetCameraSearch };
}
