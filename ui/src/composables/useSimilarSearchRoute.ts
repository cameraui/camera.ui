import type { SimilarSearchRequest } from '@/components/CuiSimilarPicker/types.js';

export function useSimilarSearchRoute() {
  const router = useRouter();
  const route = useRoute();

  const request = computed<SimilarSearchRequest | undefined>(() => {
    if (!route.query.similar) return undefined;
    const state = window.history.state as { similar?: SimilarSearchRequest } | null;
    return state?.similar?.query ? state.similar : undefined;
  });

  function openSimilarSearch(next: SimilarSearchRequest): void {
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
      path: `/cameras/${cameraName}`,
      query: { startTs: String(timestamp) },
      state: { similar: JSON.parse(JSON.stringify(next)) },
    });
  }

  function cameraSearch(): SimilarSearchRequest | undefined {
    const state = window.history.state as { similar?: SimilarSearchRequest } | null;
    return state?.similar?.query ? state.similar : undefined;
  }

  function forgetCameraSearch(): void {
    window.history.replaceState({ ...window.history.state, similar: undefined }, '');
  }

  return { request, openSimilarSearch, closeSimilarSearch, openOnCamera, cameraSearch, forgetCameraSearch };
}
