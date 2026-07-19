import { usePrimeVue } from 'primevue/config';

import { isHomeAssistant } from '@/common/base.js';
import { currentLanguage, i18n, LANGUAGE_LIST, SUPPORTED_LOCALES } from '@/i18n/index.js';
import { PRIMEVUE_LANGUAGE_LIST } from '@/i18n/primevue.js';

import type { SupportedLanguageAbbreviatons, UserLanguage } from '@shared/types';

const HA_LANGUAGE_KEY = 'selectedLanguage';

function readHaLanguage(): string | null {
  const raw = localStorage.getItem(HA_LANGUAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value === 'string' ? value : null;
  } catch {
    return raw;
  }
}

function readHostLanguage(): string | null {
  if (typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('cui_lang');
  if (param) return param;
  return isHomeAssistant() ? readHaLanguage() : null;
}

export const useLocaleStore = defineStore('locale', () => {
  const authStore = useAuthStore();
  const primevue = usePrimeVue();
  const { electron } = useElectron();
  const i18nGlobal = i18n.global;

  const language = useLocalStorage<UserLanguage>('language', 'auto');
  const locale = computed<SupportedLanguageAbbreviatons>(() => (language.value === 'auto' ? currentLanguage() : language.value));

  const languageOptions = computed(() => [
    { label: i18nGlobal.t('components.form.label.language_system'), value: 'auto' as UserLanguage },
    ...SUPPORTED_LOCALES.map((l) => ({ label: LANGUAGE_LIST[l], value: l as UserLanguage })),
  ]);

  let serverLanguage: UserLanguage | null = null;

  function setI18Nlocale(l: SupportedLanguageAbbreviatons) {
    electron?.send('change-language', l);
    i18nGlobal.locale.value = l;
  }

  async function setPrimeVueLocale(l: SupportedLanguageAbbreviatons) {
    const lang = PRIMEVUE_LANGUAGE_LIST[l];
    if (lang) {
      primevue.config.locale = lang;
    }
  }

  function applyServerLanguage(l: UserLanguage) {
    serverLanguage = l;
    language.value = l;
  }

  function applyHostLanguage(hostLang: string) {
    applyServerLanguage(currentLanguage(hostLang));
  }

  watch(language, (l) => {
    if (l === serverLanguage) return;
    serverLanguage = l;
    if (authStore.isLoggedIn) {
      authStore.updateUser({ preferences: { language: l } });
    }
  });

  watch(locale, (l) => {
    setI18Nlocale(l);
    setPrimeVueLocale(l);
  });

  const hostLanguage = readHostLanguage();
  if (hostLanguage) {
    applyHostLanguage(hostLanguage);
  }

  if (isHomeAssistant() && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== HA_LANGUAGE_KEY) return;
      const lang = readHaLanguage();
      if (lang) applyHostLanguage(lang);
    });
  }

  setI18Nlocale(locale.value);
  setPrimeVueLocale(locale.value);

  const channel = useSocket('/camera.ui');
  channel.on<{ language: UserLanguage }>('user-language', (payload) => {
    if (payload?.language) {
      applyServerLanguage(payload.language);
    }
  });

  return {
    language,
    languageOptions,
    locale,
    applyServerLanguage,
    applyHostLanguage,
    setI18Nlocale,
    setPrimeVueLocale,
  };
});
