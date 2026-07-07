import { SUPPORTED_LANGUAGES } from '@shared/types';
import { createI18n } from 'vue-i18n';

import { messages } from './languages.js';

import type { SupportedLanguageAbbreviatons } from '@shared/types';
import type { LanguageAbbreviations, LanguageList } from './types.js';

export const DEFAULT_LOCALE: SupportedLanguageAbbreviatons = 'en';
export const SUPPORTED_LOCALES: SupportedLanguageAbbreviatons[] = [...SUPPORTED_LANGUAGES];

/**
 * Update this each time a new translation is added
 * This is displayed in the interface for selecting the language
 *
 * Key (e.g. "en") represents the language shortcut also added to the "languages" array
 * Value (e.g. "English (en)") represents the Text which is displayed in the interface
 */
export const LANGUAGE_LIST: LanguageList = {
  de: 'German (de)',
  en: 'English (en)',
};

export const currentLanguage = (lang?: string): SupportedLanguageAbbreviatons => {
  const windowProp = typeof window !== 'undefined' ? window : undefined;
  const source = lang ?? windowProp?.navigator?.language ?? DEFAULT_LOCALE;

  const primary = source.toLowerCase().split('-')[0];

  return getSupportedLanguage(primary as LanguageAbbreviations);
};

export const getSupportedLanguage = (lang?: LanguageAbbreviations): SupportedLanguageAbbreviatons => {
  return SUPPORTED_LOCALES.find((l) => l === lang) ?? DEFAULT_LOCALE;
};

export const i18n = createI18n({
  locale: currentLanguage(),
  fallbackLocale: DEFAULT_LOCALE,
  legacy: false,
  globalInjection: true,
  messages,
});
