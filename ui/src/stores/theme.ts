import { isCapacitor } from '@/connection/index.js';

import type { SupportedThemes, ThemeLocalStorage } from '@shared/types';

async function syncNativeStatusBar(t: SupportedThemes): Promise<void> {
  if (!isCapacitor) return;
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  await StatusBar.setStyle({ style: t === 'dark' ? Style.Dark : Style.Light });
}

function readForcedTheme(): SupportedThemes | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('cui_theme');
  return value === 'dark' || value === 'light' ? value : null;
}

export const useThemeStore = defineStore('theme', () => {
  const themeObj = localStorage.getItem('theme');

  const localStorageObj: ThemeLocalStorage = themeObj
    ? JSON.parse(themeObj)
    : {
        theme: 'dark',
        autoMode: true,
      };

  const forced = readForcedTheme();
  if (forced) {
    localStorageObj.theme = forced;
    localStorageObj.autoMode = false;
  }

  const theme = refWithControl<SupportedThemes>(localStorageObj.theme, {
    onBeforeChange() {
      if (!themeChanged.value) {
        return false;
      } else {
        // window.scrollTo(0, 0);
      }
    },
    onChanged(value) {
      localStorageObj.theme = value;
      localStorage.setItem('theme', JSON.stringify(localStorageObj));
    },
  });

  const autoMode = refWithControl<boolean>(localStorageObj.autoMode, {
    onBeforeChange(state) {
      if (state && !themeChanged.value) {
        return false;
      }
    },
    onChanged(value) {
      localStorageObj.autoMode = value;
      localStorage.setItem('theme', JSON.stringify(localStorageObj));
    },
  });

  const themeChanged = ref(true);
  const colors = reactive<SupportedThemes[]>(['light', 'dark']);

  function getSystemMode(): SupportedThemes {
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return darkMode ? 'dark' : 'light';
  }

  function currentTheme(): SupportedThemes {
    return autoMode.value ? getSystemMode() : theme.value;
  }

  function setAppTheme(t: SupportedThemes): void {
    document.documentElement.setAttribute('data-mode', t);

    switch (t) {
      case 'light':
        document.documentElement.classList.remove('dark-mode');
        document.documentElement.classList.add('light-mode');
        break;
      case 'dark':
        document.documentElement.classList.remove('light-mode');
        document.documentElement.classList.add('dark-mode');
        break;
    }

    syncNativeStatusBar(t);
  }

  function applyHostTheme(mode: SupportedThemes): void {
    autoMode.value = false;
    theme.value = mode;
  }

  function toggleTheme(): void {
    if (autoMode.value) {
      autoMode.value = false;
      theme.value = 'light';
    } else {
      if (theme.value === 'light') {
        theme.value = 'dark';
      } else {
        autoMode.value = true;
      }
    }
  }

  const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)');

  watch(
    autoMode,
    (state) => {
      if (state) {
        theme.value = getSystemMode();
      }
    },
    { immediate: true, deep: true },
  );

  watch(theme, (t) => {
    nextTick(() => {
      setAppTheme(t);
      themeChanged.value = true;
    });

    themeChanged.value = false;
  });

  watch(isPreferredDark, (isDark) => {
    if (autoMode.value) {
      theme.value = isDark ? 'dark' : 'light';
    }
  });

  setAppTheme(currentTheme());

  return {
    colors,
    theme,
    autoMode,
    setAppTheme,
    getSystemMode,
    toggleTheme,
    applyHostTheme,
  };
});
