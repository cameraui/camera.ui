import { LANGUAGES } from '@shared/types';

import type { LanguageAbbreviations } from '@shared/types';

export function languageOptions(locale: string): { label: string; value: LanguageAbbreviations }[] {
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  return LANGUAGES.map((code) => ({ label: names.of(code) ?? code, value: code })).sort((a, b) => a.label.localeCompare(b.label, locale));
}
