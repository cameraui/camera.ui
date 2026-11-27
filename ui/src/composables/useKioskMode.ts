import { isCapacitor } from '@/connection/index.js';

export const useKioskMode = createSharedComposable(() => {
  const route = useRoute();
  const router = useRouter();
  const { uiSettings } = storeToRefs(useUiStore());

  const enabled = useLocalStorage('cui-home-kiosk', false);
  const active = computed(() => enabled.value && route.name === 'Home' && uiSettings.value.home.dashboard);

  watch(
    () => route.query.kiosk,
    (value) => {
      if (typeof value !== 'string') return;
      enabled.value = value !== '0';
      router.replace({ query: { ...route.query, kiosk: undefined } });
    },
    { immediate: true },
  );

  watch(
    active,
    (on, was) => {
      if (isCapacitor && (on || was)) setStatusBar(!on);
    },
    { immediate: true },
  );

  return { enabled, active };
});

async function setStatusBar(visible: boolean): Promise<void> {
  const { StatusBar } = await import('@capacitor/status-bar');
  await (visible ? StatusBar.show() : StatusBar.hide());
}
