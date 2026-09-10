<template>
  <div class="cui-assistant-question rounded-xl px-4 py-3 text-sm flex flex-col gap-3">
    <div class="flex items-start gap-2">
      <i-mdi:help-circle-outline class="w-5 h-5 shrink-0 text-muted mt-0.5" />
      <div class="min-w-0 flex-1 font-medium text-color">{{ question.question }}</div>
    </div>

    <div v-if="options.length" class="flex flex-wrap gap-2">
      <Button
        v-for="option in options"
        :key="option"
        type="button"
        severity="secondary"
        outlined
        class="cui-button-small"
        :disabled="!canResolve || busy"
        :label="option"
        @click="emit('answer', option)"
      />
    </div>

    <div v-if="question.kind === 'time_range'" class="flex flex-col sm:flex-row gap-2">
      <div class="flex flex-1 flex-col gap-1">
        <label :for="`question-from-${question.toolCallId}`" class="text-xs text-muted">{{ $t('views.assistant.question_from') }}</label>
        <InputText :id="`question-from-${question.toolCallId}`" v-model="from" type="datetime-local" fluid size="small" />
      </div>
      <div class="flex flex-1 flex-col gap-1">
        <label :for="`question-to-${question.toolCallId}`" class="text-xs text-muted">{{ $t('views.assistant.question_to') }}</label>
        <InputText :id="`question-to-${question.toolCallId}`" v-model="to" type="datetime-local" fluid size="small" />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <InputText
        v-if="question.kind !== 'time_range'"
        v-model="text"
        class="flex-1 min-w-0"
        size="small"
        :placeholder="$t('views.assistant.question_placeholder')"
        @keydown.enter.prevent="submit"
      />
      <span v-else class="flex-1" />
      <Button
        type="button"
        severity="secondary"
        text
        class="cui-button-small"
        :disabled="!canResolve || busy"
        :label="$t('views.assistant.question_skip')"
        @click="emit('skip')"
      />
      <Button
        type="button"
        class="cui-button-small"
        :disabled="!canResolve || busy || !answer"
        :loading="busy"
        :label="$t('views.assistant.question_answer')"
        @click="submit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiAssistantQuestionEmits, CuiAssistantQuestionProps } from './types.js';

const props = defineProps<CuiAssistantQuestionProps>();
const emit = defineEmits<CuiAssistantQuestionEmits>();

const text = ref('');
const from = ref('');
const to = ref('');

const options = computed(() => (props.question.options ?? []).filter((option) => option.trim()));

const answer = computed(() => {
  if (props.question.kind !== 'time_range') return text.value.trim();
  if (!from.value || !to.value) return '';
  return `from ${toIso(from.value)} to ${toIso(to.value)}`;
});

function toIso(local: string): string {
  const date = new Date(local);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (value: number) => String(Math.abs(value)).padStart(2, '0');
  return `${local.length === 16 ? `${local}:00` : local}${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`;
}

function submit(): void {
  if (!answer.value) return;
  emit('answer', answer.value);
}
</script>

<style scoped>
.cui-assistant-question {
  background: color-mix(in srgb, var(--p-primary-color) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 35%, transparent);
}
</style>
