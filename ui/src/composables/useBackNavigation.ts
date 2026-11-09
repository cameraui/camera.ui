import type { RouteLocationRaw } from 'vue-router';

const NO_RETURN = new Set(['Login', 'FirstSteps', 'NotFound']);

export function useBackNavigation() {
  const router = useRouter();
  const route = useRoute();

  function previousPath(): string | undefined {
    const back = router.options.history.state.back;
    if (typeof back !== 'string') return undefined;

    const previous = router.resolve(back);
    if (!previous.matched.length || NO_RETURN.has(String(previous.name)) || previous.path === route.path) return undefined;
    return previous.path;
  }

  function goBack(fallback: RouteLocationRaw): void {
    if (previousPath()) router.back();
    else router.push(fallback);
  }

  return { previousPath, goBack };
}
