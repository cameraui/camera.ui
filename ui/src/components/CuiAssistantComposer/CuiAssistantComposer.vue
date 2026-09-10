<template>
  <div class="cui-assistant-composer rounded-2xl">
    <Textarea
      ref="inputRef"
      v-model="text"
      :placeholder="placeholder"
      :disabled="disabled"
      auto-resize
      rows="1"
      class="cui-assistant-input block w-full max-h-52 resize-none px-4 pt-3.5 pb-1 text-[15px] leading-relaxed"
      @keydown.enter.exact.prevent="submit"
      @paste="onPaste"
    />

    <div v-if="attachments.length" class="flex flex-wrap gap-2 px-3 pb-1">
      <div v-for="item in attachments" :key="item.id" class="cui-assistant-attachment relative flex items-center rounded-lg text-xs text-color">
        <img v-if="item.kind === 'image'" :src="item.preview" class="h-14 w-14 rounded-lg object-cover" alt="" />
        <span v-else class="flex items-center gap-1.5 px-2.5 py-2">
          <i-mdi:music-note v-if="item.kind === 'audio'" class="w-4 h-4 text-muted" />
          <i-mdi:video-outline v-else class="w-4 h-4 text-muted" />
          <span class="max-w-40 truncate">{{ item.name }}</span>
          <span class="text-muted">{{ formatSize(item.size) }}</span>
        </span>
        <Button
          v-tooltip.top="{ value: $t('views.assistant.attach_remove') }"
          type="button"
          severity="secondary"
          rounded
          class="cui-assistant-attachment-remove cui-icon-sm absolute -top-1.5 -right-1.5"
          @click="removeAttachment(item.id)"
        >
          <template #icon>
            <i-mdi:close class="w-3 h-3" />
          </template>
        </Button>
      </div>
    </div>
    <Message v-if="attachError" severity="warn" variant="simple" size="small" class="px-3 pb-1">{{ attachError }}</Message>

    <div class="flex items-center px-2 pb-2 pl-3" :class="compact ? 'gap-0.5' : 'gap-2'">
      <slot name="tools" />
      <Button
        v-tooltip.top="{ value: $t('views.assistant.attach') }"
        type="button"
        severity="secondary"
        text
        rounded
        class="shrink-0"
        :disabled="disabled || busy"
        @click="fileInput?.click()"
      >
        <template #icon>
          <i-mdi:paperclip class="w-4 h-4" />
        </template>
      </Button>
      <input ref="fileInput" type="file" class="hidden" multiple :accept="ATTACHMENT_ACCEPT" @change="onFilesPicked" />
      <Button
        v-if="voiceAvailable"
        v-tooltip.top="{ value: listening ? $t('views.assistant.voice_stop') : $t('views.assistant.voice_start') }"
        type="button"
        severity="secondary"
        text
        rounded
        class="cui-assistant-voice shrink-0"
        :class="{ 'cui-assistant-voice-active': listening }"
        :disabled="disabled || busy"
        @click="toggleVoice"
      >
        <template #icon>
          <i-mdi:microphone class="w-4 h-4" />
        </template>
      </Button>

      <span v-if="!smBreakpoint && !compact" class="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted">
        <kbd class="cui-assistant-kbd">↵</kbd> {{ $t('views.assistant.hint_send') }} · <kbd class="cui-assistant-kbd">⇧↵</kbd> {{ $t('views.assistant.hint_newline') }}
      </span>
      <span v-else class="ml-auto" />

      <Button
        v-if="busy"
        v-tooltip.top="{ value: $t('views.assistant.stop') }"
        type="button"
        severity="secondary"
        outlined
        class="cui-assistant-send shrink-0"
        @click="emit('stop')"
      >
        <template #icon>
          <i-mdi:stop class="w-4 h-4" />
        </template>
      </Button>
      <Button type="button" class="cui-assistant-send shrink-0" :disabled="disabled || (!text.trim() && !attachments.length)" @click="submit">
        <template #icon>
          <i-mdi:arrow-up class="w-4 h-4" />
        </template>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { randomId } from '@/common/utils.js';
import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMITS, MAX_ATTACHMENTS, SPEECH_LOCALES } from './types.js';

import type { ComposerAttachment, ComposerAttachmentKind, CuiAssistantComposerEmits, CuiAssistantComposerProps, SpeechRecognitionLike } from './types.js';

const props = withDefaults(defineProps<CuiAssistantComposerProps>(), {
  busy: false,
  disabled: false,
  placeholder: '',
  compact: false,
});

const emit = defineEmits<CuiAssistantComposerEmits>();

const { smBreakpoint } = useSharedCuiBreakpoint();
const { t, locale } = useI18n();

const speechCtor =
  (window as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
  (window as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

const voiceAvailable = Boolean(speechCtor) && window.isSecureContext;

const inputRef = useTemplateRef<{ $el: HTMLElement }>('inputRef');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const text = ref('');
const listening = ref(false);
const attachments = ref<ComposerAttachment[]>([]);
const attachError = ref('');

let recognition: SpeechRecognitionLike | null = null;
let attachErrorTimer: ReturnType<typeof setTimeout> | undefined;

function textarea(): HTMLTextAreaElement | null {
  const el = inputRef.value?.$el;
  return (el?.tagName === 'TEXTAREA' ? el : el?.querySelector('textarea')) as HTMLTextAreaElement | null;
}

function focus(): void {
  textarea()?.focus();
}

function resize(): void {
  const el = textarea();
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function submit(): void {
  const value = text.value.trim();
  if ((!value && !attachments.value.length) || props.disabled) return;
  emit('send', { text: value, attachments: attachments.value });
  text.value = '';
  attachments.value = [];
}

function showAttachError(message: string): void {
  attachError.value = message;
  clearTimeout(attachErrorTimer);
  attachErrorTimer = setTimeout(() => (attachError.value = ''), 4000);
}

function kindOf(file: File): ComposerAttachmentKind | undefined {
  const prefix = file.type.split('/')[0];
  return prefix === 'image' || prefix === 'audio' || prefix === 'video' ? prefix : undefined;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addFiles(files: Iterable<File>): Promise<void> {
  for (const file of files) {
    const kind = kindOf(file);
    if (!kind) {
      showAttachError(t('views.assistant.attach_unsupported'));
      continue;
    }
    if (file.size > ATTACHMENT_LIMITS[kind]) {
      showAttachError(t('views.assistant.attach_too_large', { max: Math.round(ATTACHMENT_LIMITS[kind] / 1024 / 1024) }));
      continue;
    }
    if (attachments.value.length >= MAX_ATTACHMENTS) {
      showAttachError(t('views.assistant.attach_too_many', { max: MAX_ATTACHMENTS }));
      break;
    }
    const dataUrl = await readAsDataUrl(file);
    attachments.value.push({
      id: randomId(),
      name: file.name || kind,
      kind,
      mimeType: file.type,
      size: file.size,
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
      preview: kind === 'image' ? dataUrl : undefined,
    });
  }
}

async function onFilesPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) await addFiles(Array.from(input.files));
  input.value = '';
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  await addFiles(files);
}

function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter((item) => item.id !== id);
}

function toggleVoice(): void {
  if (listening.value) {
    recognition?.stop();
    return;
  }
  if (!speechCtor) return;

  const base = text.value.trim();
  const session = new speechCtor();
  session.lang = SPEECH_LOCALES[locale.value] ?? locale.value;
  session.interimResults = true;
  session.continuous = false;
  session.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0]?.transcript ?? '';
    text.value = base ? `${base} ${transcript.trim()}` : transcript.trim();
  };
  session.onend = () => {
    listening.value = false;
    recognition = null;
    focus();
  };
  session.onerror = () => {
    listening.value = false;
    recognition = null;
  };
  recognition = session;
  listening.value = true;
  session.start();
}

watch(text, () => nextTick(resize));

onBeforeUnmount(() => {
  recognition?.abort();
  clearTimeout(attachErrorTimer);
});

defineExpose({ focus });
</script>

<style scoped>
.cui-assistant-composer {
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  box-shadow: var(--shadow-md);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.cui-assistant-composer:focus-within {
  border-color: var(--p-primary-color);
  box-shadow:
    var(--shadow-md),
    0 0 0 3px color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

.cui-assistant-input,
.cui-assistant-input:enabled:hover,
.cui-assistant-input:enabled:focus {
  background: transparent;
  border: none;
  box-shadow: none;
  outline: none;
  caret-color: var(--p-primary-color);
}

.cui-assistant-kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border-color-inner);
  background: var(--ground-background);
}

.cui-assistant-send {
  width: 32px;
  height: 32px;
  border-radius: 9px;
}
.cui-assistant-voice-active {
  color: var(--p-primary-color);
  animation: cui-assistant-voice-pulse 1.2s ease-in-out infinite;
}

@keyframes cui-assistant-voice-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
