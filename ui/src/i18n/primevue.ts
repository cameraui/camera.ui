import * as primeVueDe from 'primelocale/js/de.js';
import * as primeVueEn from 'primelocale/js/en.js';

import type { SupportedLanguageAbbreviatons } from '@shared/types';
import type { Locale } from 'primelocale/js/locale.js';

export const PRIMEVUE_LANGUAGE_LIST: Partial<Record<SupportedLanguageAbbreviatons, Locale>> = {
  de: primeVueDe.de,
  en: primeVueEn.en,
};
