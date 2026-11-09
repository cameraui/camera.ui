import { tryInject } from '../container.js';
import de from './locales/de.js';
import en from './locales/en.js';

import type { LanguageAbbreviations } from '../api/schemas/users.schema.js';

export type Messages = typeof en;

type MessageKey = { [Area in keyof Messages]: `${Area}.${keyof Messages[Area] & string}` }[keyof Messages];

const LOCALES: Partial<Record<LanguageAbbreviations, Messages>> = { de, en };

export function instanceLanguage(): LanguageAbbreviations {
  return tryInject('dbs')?.settingsDB.get('settings')?.language ?? 'en';
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const [area, name] = key.split('.') as [keyof Messages, string];
  const messages = LOCALES[instanceLanguage()] ?? en;
  const text = (messages[area] as Record<string, string>)[name];
  return text.replace(/\{(\w+)\}/g, (placeholder, param: string) => (param in params ? String(params[param]) : placeholder));
}
