<template>
  <div>
    <div class="relative mb-4 rounded-xl overflow-hidden w-fit mx-auto">
      <img :src="src" alt="Face recognition test image" class="block max-w-full max-h-[50vh] w-auto object-contain" />
      <span
        v-for="(point, i) in landmarks"
        :key="i"
        class="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white/80"
        :style="{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }"
      />
    </div>

    <div class="text-sm text-muted mb-4">
      {{ dimensions }}-dim
      <span v-if="embeddingModel" class="ml-1">({{ embeddingModel }})</span>
      <span v-if="quality != null" class="ml-1">· {{ $t('components.face_recognition_interface.quality', { value: (quality * 100).toFixed(0) }) }}</span>
    </div>

    <div class="flex gap-2 mb-4">
      <Select v-model="sensitivity" :options="sensitivityOptions" option-label="label" option-value="value" class="flex-1" />
      <Button class="cui-button-medium" :label="$t('components.face_recognition_interface.match')" :loading="matching" @click="runMatch" />
    </div>

    <div v-if="results.length" class="flex flex-col gap-2">
      <div v-for="(result, i) in results" :key="i" class="flex items-center justify-between p-3 rounded-lg content-background">
        <span class="text-sm truncate flex-1 mr-3">
          {{ result.identity ?? $t('components.face_recognition_interface.no_match') }}
        </span>
        <div class="flex items-center gap-2 shrink-0">
          <div v-if="result.score != null" class="text-sm font-medium">{{ (result.score * 100).toFixed(0) }}%</div>
          <Tag
            :value="$t(`components.face_recognition_interface.sensitivity_${result.sensitivity}`)"
            :severity="result.identity ? 'success' : 'danger'"
            class="text-xs"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FACE_RECOGNITION_SENSITIVITIES } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { PluginFaceRecognitionProps } from './types.js';

const props = defineProps<PluginFaceRecognitionProps>();

const { t } = useI18n();
const log = useLogger();

const sensitivity = ref('balanced');
const matching = ref(false);
const results = ref<{ sensitivity: string; identity?: string; score?: number }[]>([]);

const sensitivityOptions = computed(() =>
  FACE_RECOGNITION_SENSITIVITIES.map((value) => ({ value, label: t(`components.face_recognition_interface.sensitivity_${value}`) })),
);

async function runMatch() {
  if (matching.value) return;

  matching.value = true;
  try {
    const match = await props.onMatch(sensitivity.value);
    results.value.unshift({ sensitivity: sensitivity.value, identity: match?.identity, score: match?.score });
  } catch (err) {
    log.error('Face match failed:', err);
  } finally {
    matching.value = false;
  }
}

onMounted(runMatch);

defineExpose<CustomDialogComponent>({});
</script>
