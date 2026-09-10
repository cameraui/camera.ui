export interface CuiAssistantComposerProps {
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export interface CuiAssistantComposerEmits {
  (e: 'send', submission: ComposerSubmission): void;
  (e: 'stop'): void;
}

export type ComposerAttachmentKind = 'image' | 'audio' | 'video';

export interface ComposerAttachment {
  id: string;
  name: string;
  kind: ComposerAttachmentKind;
  mimeType: string;
  size: number;
  data: string;
  preview?: string;
}

export interface ComposerSubmission {
  text: string;
  attachments: ComposerAttachment[];
}

export const ATTACHMENT_LIMITS: Record<ComposerAttachmentKind, number> = {
  image: 12 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 60 * 1024 * 1024,
};

export const MAX_ATTACHMENTS = 8;
export const ATTACHMENT_ACCEPT = 'image/*,audio/*,video/*';

export const SPEECH_LOCALES: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ru: 'ru-RU',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
