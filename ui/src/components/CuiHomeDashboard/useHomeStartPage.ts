import { CAMERAS_PAGE } from './pages.js';

export function useHomeStartPage() {
  const { user } = storeToRefs(useAuthStore());
  const { uiSettings } = storeToRefs(useUiStore());

  const username = computed(() => user.value?.username ?? '');

  return computed({
    get: () => uiSettings.value.home.startPages[username.value] ?? CAMERAS_PAGE,
    set: (id: string) => {
      if (id === CAMERAS_PAGE) delete uiSettings.value.home.startPages[username.value];
      else uiSettings.value.home.startPages[username.value] = id;
    },
  });
}
