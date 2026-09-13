import type { SupportedLanguageAbbreviatons } from '@shared/types';
import type en from './locales/en.js';

export type LanguageList = Partial<Record<SupportedLanguageAbbreviatons, string>>;

export type MessageShema = typeof en;

export type Messages = Record<SupportedLanguageAbbreviatons, MessageShema>;
