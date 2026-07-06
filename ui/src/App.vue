<template>
  <div
    v-if="showLoadingScreen"
    class="flex w-full h-full justify-center items-center absolute z-50"
    :style="{ minHeight: isPWA ? '100vh !important' : '100dvh !important' }"
  >
    <CuiLoadingScreen reload :text="switchingText" />
  </div>

  <div class="app" v-else>
    <CuiToast />

    <ConfirmPopup />

    <DynamicDialog />

    <CuiCameraDrawer />

    <CuiTopbar v-if="showTopbar" ref="topbarRef" class="z-2 top-0" :offset-left="mdBreakpoint ? 0 : navbarTargetWidth" :animate="layoutReady" />

    <CuiBottombar v-if="showBottombar" ref="bottombarRef" class="z-2" />

    <CuiNavbar v-if="showNavbar" ref="navbarRef" class="z-3 top-0 left-0" />

    <main
      id="container"
      class="relative w-dvw z-1 overflow-x-hidden"
      :style="{
        transition: layoutReady ? 'padding-left 200ms' : undefined,
        paddingTop: topbarRef ? `${topbar.height.value}px` : 'env(safe-area-inset-top, 0px)',
        paddingLeft: navbarPaddingLeft,
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingBottom: bottombarRef ? `${bottombar.height.value}px` : routeMeta.ignoreSafeAreaBottom.value ? '0px' : 'env(safe-area-inset-bottom, 0px)',
      }"
    >
      <div
        class="w-full max-w-full h-full grid"
        :class="{
          'p-2': routeMeta.padding.value,
          'pt-0': routeMeta.paddingTop.value === false,
          'pb-0': routeMeta.paddingBottom.value === false && !bottombarRef,
          'pb-4': (routeMeta.paddingBottom.value || bottombarRef) && !routeMeta.disableScroll,
          'pl-0': routeMeta.paddingLeft.value === false,
          'pr-0': routeMeta.paddingRight.value === false,
        }"
        :style="{
          minHeight: containerHeight,
          maxHeight: routeMeta.disableScroll.value ? containerHeight : undefined,
          height: routeMeta.disableScroll.value ? containerHeight : undefined,
          overflow: routeMeta.disableScroll.value ? 'hidden' : undefined,
        }"
      >
        <RouterView v-slot="{ Component }">
          <component
            :key="instanceStore.switchKey"
            class="w-full h-full relative min-w-0"
            :class="{ 'overflow-x-hidden': !routeMeta.allowOverflowX.value }"
            :is="Component"
            :navbar-width="navbarTargetWidth"
            :navbar-left="navbarLeft"
          />
        </RouterView>
      </div>
    </main>

    <CuiWindowButtons v-if="isElectronApp" />

    <Teleport v-if="navbarState === 'opened' || (subbarState === 'opened' && mdBreakpoint)" :to="navbarState === 'opened' ? '#app' : '#container'" defer>
      <div
        v-if="mdBreakpoint"
        class="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-1"
        :class="{
          'z-2': navbarState === 'opened',
        }"
      ></div>
    </Teleport>

    <div
      class="fixed-bg"
      :style="{
        background: routeMeta.background.value,
      }"
    ></div>

    <CuiConnectionIndicator />
    <CuiUpdateIndicator />

    <CuiAppLockOverlay />
  </div>
</template>

<script setup lang="ts">
import { clearPendingIntent, readPendingIntent } from '@/common/pushIntent';
import { NAVBAR_SIZE } from '@/components/CuiNavbar/types.js';
import { getConnection, isCapacitor, isConnectionBooted } from '@/connection/index.js';

const { navbarState, subbarState, showBottombar, showNavbar, showTopbar } = useSharedCuiStates();
const routeMeta = useRouteMeta();
const route = useRoute();
const router = useRouter();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { isPWA } = useSharedCuiUserAgent();
const { t } = useI18n();
const connection = useConnection();
const { isElectronApp } = useElectron();

useLocaleStore();
setupAppUpdate();
usePushHandler();
useElectronNotifications();
useElectronDeepLinks();

const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);

const instanceStore = useInstanceStore();

const PENDING_INTENT_WAIT_MS = 60_000;

const navbarRef = useTemplateRef<HTMLElement>('navbarRef');
const topbarRef = useTemplateRef<HTMLElement>('topbarRef');
const bottombarRef = useTemplateRef<HTMLElement>('bottombarRef');
const loading = ref(true);
const layoutReady = ref(false);

const topbar = useElementSize(topbarRef, { width: 0, height: 0 }, { box: 'border-box' });
const bottombar = useElementSize(bottombarRef, { width: 0, height: 0 }, { box: 'border-box' });

const navbarTargetWidth = computed(() => {
  if (navbarState.value === 'closed' || navbarState.value === 'minified') {
    return mdBreakpoint.value ? NAVBAR_SIZE.CLOSED : NAVBAR_SIZE.MINIFIED;
  }
  return NAVBAR_SIZE.EXPANDED;
});

const navbarLeft = computed(() => {
  if (navbarState.value === 'closed') {
    return 0;
  }
  return 8;
});

const navbarPaddingLeft = computed(() => {
  if (!navbarRef.value || mdBreakpoint.value) {
    return 'env(safe-area-inset-left, 0px)';
  }
  return `calc(${navbarTargetWidth.value}px + max(${navbarLeft.value}px, env(safe-area-inset-left, 0px)))`;
});

const appBG = computed(() => {
  if (routeMeta.showTopbar.value) return 'var(--topbar-background)';
  if (routeMeta.background.value) return routeMeta.background.value;
  return 'var(--ground-background)';
});

const containerHeight = computed(() => {
  const top = topbarRef.value ? `${topbar.height.value}px` : 'env(safe-area-inset-top, 0px)';
  const bottom = bottombarRef.value ? `${bottombar.height.value}px` : routeMeta.ignoreSafeAreaBottom.value ? '0px' : 'env(safe-area-inset-bottom, 0px)';
  const extraPadding = bottombarRef.value || !routeMeta.disableScroll.value || routeMeta.noExtraPadding.value ? '0px' : '8px';
  return `calc(100dvh - ${top} - ${bottom} - ${extraPadding})`;
});

const showLoadingScreen = computed(() => {
  return (route.meta.auth?.requiresAuth && !isLoggedIn.value) || loading.value || instanceStore.isSwitching;
});

const switchingText = computed(() => {
  if (!instanceStore.isSwitching || !instanceStore.switchTargetName) return undefined;
  return `${t('components.instance_switcher.switching_to')} ${instanceStore.switchTargetName}...`;
});

async function consumePendingIntent(): Promise<void> {
  if (!isCapacitor || !isConnectionBooted()) return;
  let intent;
  try {
    intent = await readPendingIntent();
  } catch {
    return;
  }
  if (!intent) return;
  if (intent.kind !== 'open-server' || !intent.deepLink) {
    await clearPendingIntent();
    return;
  }

  const ready = await getConnection().whenOnline({ timeoutMs: PENDING_INTENT_WAIT_MS });
  await clearPendingIntent();
  if (!ready) return;
  try {
    await router.push(intent.deepLink);
  } catch {
    // navigation guard rejection — ignore
  }
}

watch(
  [isLoggedIn, () => connection.isOnline.value],
  ([loggedIn, online], prev) => {
    if (instanceStore.isSwitching) return;
    const wasReady = prev?.[0] === true && prev?.[1] === true;
    const isReady = loggedIn && online;
    if (isReady && !wasReady) {
      instanceStore.saveCurrentTokens();
      instanceStore.fetchInstances();
    }
  },
  { immediate: true },
);

watch(
  [appBG, theme],
  () => {
    nextTick(() => {
      const varRegex = /^var\([^)]+\)$/;
      if (varRegex.test(appBG.value)) {
        const style = window.getComputedStyle(document.body);
        const cssVar = appBG.value.split('var(')[1].split(')')[0];
        const cssValue = style.getPropertyValue(cssVar);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cssValue);
      } else {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appBG.value);
      }
    });
  },
  { immediate: true },
);

watch(
  () => routeMeta.disableScroll.value,
  (disabled) => {
    document.body.classList.toggle('disable-overflow-scroll', disabled);
    document.documentElement.classList.toggle('disable-overflow-scroll', disabled);
  },
  { immediate: true },
);

onMounted(async () => {
  await router.isReady();
  consumePendingIntent();
  loading.value = false;
  requestAnimationFrame(() => {
    layoutReady.value = true;
  });
});
</script>

<style scoped>
.fixed-bg {
  position: fixed;
  top: calc(0px - env(safe-area-inset-top, 0px) - 10px);
  left: calc(0px - env(safe-area-inset-left, 0px) - 10px);
  right: calc(0px - env(safe-area-inset-right, 0px) - 10px);
  bottom: calc(0px - env(safe-area-inset-bottom, 0px) - 10px);
  z-index: 0;
}
</style>
