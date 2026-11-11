import { isHaCards } from '@/common/base.js';
import { isCapacitor } from '@/connection/index.js';

import type { SupportedThemes, ThemeLocalStorage } from '@shared/types';

interface NativeAppearancePlugin {
  setStyle(options: { style: SupportedThemes | 'system' }): Promise<void>;
}

async function syncNativeTheme(t: SupportedThemes, followSystem: boolean): Promise<void> {
  if (!isCapacitor) return;
  const [{ StatusBar, Style }, { registerPlugin }] = await Promise.all([import('@capacitor/status-bar'), import('@capacitor/core')]);
  await StatusBar.setStyle({ style: t === 'dark' ? Style.Dark : Style.Light });
  // app builds without the plugin reject the call
  await registerPlugin<NativeAppearancePlugin>('Appearance')
    .setStyle({ style: followSystem ? 'system' : t })
    .catch(() => {});
}

function readForcedTheme(): SupportedThemes | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('cui_theme');
  return value === 'dark' || value === 'light' ? value : null;
}

export function readThemeStorage(): ThemeLocalStorage {
  const fallback: ThemeLocalStorage = { theme: 'dark', autoMode: true };
  const raw = localStorage.getItem('theme');
  if (!raw) return fallback;

  if (raw === 'dark' || raw === 'light') return { theme: raw, autoMode: false };

  try {
    const parsed = JSON.parse(raw) as Partial<ThemeLocalStorage>;
    if (parsed?.theme !== 'dark' && parsed?.theme !== 'light') return fallback;
    return { theme: parsed.theme, autoMode: parsed.autoMode !== false };
  } catch {
    return fallback;
  }
}

function applyThemeClasses(el: Element, t: SupportedThemes): void {
  el.setAttribute('data-mode', t);
  el.classList.toggle('dark-mode', t === 'dark');
  el.classList.toggle('light-mode', t === 'light');
}

export const useThemeStore = defineStore('theme', () => {
  const themeRoots = new Set<Element>();
  const localStorageObj: ThemeLocalStorage = readThemeStorage();

  const forced = readForcedTheme();
  if (forced) {
    localStorageObj.theme = forced;
    localStorageObj.autoMode = false;
  }

  const theme = refWithControl<SupportedThemes>(localStorageObj.theme, {
    onBeforeChange() {
      if (!themeChanged.value) {
        return false;
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
    for (const el of themeRoots) applyThemeClasses(el, t);
    if (isHaCards()) {
      // dark values must sit on <html>, var() resolves on the declaring element
      document.documentElement.classList.toggle('dark-mode', t === 'dark');
      document.documentElement.classList.toggle('light-mode', t === 'light');
      return;
    }

    document.documentElement.style.background = t === 'dark' ? '#0d0d0d' : '#f8fafc';
    applyThemeClasses(document.documentElement, t);
  }

  function registerThemeRoot(el: Element): () => void {
    themeRoots.add(el);
    applyThemeClasses(el, currentTheme());
    return () => {
      themeRoots.delete(el);
    };
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

  watch(
    [theme, autoMode],
    () => {
      syncNativeTheme(currentTheme(), autoMode.value);
    },
    { immediate: true },
  );

  setAppTheme(currentTheme());

  return {
    colors,
    theme,
    autoMode,
    setAppTheme,
    getSystemMode,
    toggleTheme,
    applyHostTheme,
    registerThemeRoot,
  };
});
