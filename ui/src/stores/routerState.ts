export const useRouterStore = defineStore('routerState', () => {
  const routerLoading = ref(true);
  const routeFrom = ref<string>();
  const routeTo = ref<string>();
  const previousRouteFrom = ref<string>();
  const previousRouteTo = ref<string>();
  const isTransitioning = ref(false);

  const morphCamera = computed(() => cameraFromPath(routeTo.value) ?? cameraFromPath(routeFrom.value));

  function setRoutes(from: string, to: string) {
    previousRouteFrom.value = routeFrom.value;
    previousRouteTo.value = routeTo.value;
    routeFrom.value = from;
    routeTo.value = to;
  }

  return {
    routerLoading,
    routeFrom,
    routeTo,
    previousRouteFrom,
    previousRouteTo,
    isTransitioning,
    morphCamera,
    setRoutes,
  };
});

function cameraFromPath(path?: string): string | undefined {
  const match = path?.match(/^\/cameras\/([^/?#]+)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
