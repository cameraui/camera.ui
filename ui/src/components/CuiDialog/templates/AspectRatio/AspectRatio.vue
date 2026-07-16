<template>
  <div class="flex flex-col gap-4">
    <div class="relative w-full bg-black rounded-xl overflow-hidden flex items-center justify-center" :style="{ height: '40vh' }">
      <div class="relative" :style="ratioBoxStyle">
        <CuiCameraSnapshot :camera="camera" :show-loading-screen="false" :show-timestamp="true" class="absolute inset-0" :image-style="{ objectFit: 'fill' }" />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.form.label.aspect_ratio') }}</label>

      <SelectButton
        :model-value="isPreset ? value : null"
        :options="presets"
        :allow-empty="true"
        size="small"
        @update:model-value="(v: string | null) => v && (value = v)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label for="aspect-ratio-custom" class="cui-label">{{ t('components.form.label.aspect_ratio_custom') }}</label>

      <InputGroup>
        <InputText id="aspect-ratio-custom" v-model.trim="value" :invalid="Boolean(errorMessage)" placeholder="16:9" spellcheck="false" @keydown.enter.prevent />
      </InputGroup>

      <Transition name="fade">
        <Message v-if="errorMessage" severity="error" variant="simple" size="small" class="cui-input-error">{{ errorMessage }}</Message>
      </Transition>
      <Message v-if="!errorMessage" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ hint }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import CuiCameraSnapshot from '@/components/CuiCameraSnapshot/CuiCameraSnapshot.vue';

import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { CameraAspectRatio } from '@camera.ui/sdk';
import type { AspectRatioProps } from './types.js';

const props = defineProps<AspectRatioProps>();

const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const value = ref(props.current || '16:9');

const RATIO_RE = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

const parsed = computed(() => {
  const match = value.value.match(RATIO_RE);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
});

const isPreset = computed(() => props.presets.includes(value.value));

const errorMessage = computed(() => {
  if (parsed.value) return '';
  return value.value.trim() === '' ? t('components.form.hint.aspect_ratio_required') : t('components.form.hint.aspect_ratio_invalid');
});

const hint = computed(() => {
  if (!parsed.value || isPreset.value) return t('components.form.hint.aspect_ratio');
  return t('components.form.hint.aspect_ratio_custom', { ratio: (parsed.value.w / parsed.value.h).toFixed(2) });
});

const ratioBoxStyle = computed(() => {
  const ratio = parsed.value ?? { w: 16, h: 9 };
  return {
    width: `min(100%, calc(40vh * ${ratio.w / ratio.h}))`,
    aspectRatio: `${ratio.w} / ${ratio.h}`,
    transition: 'width 0.25s ease, aspect-ratio 0.25s ease',
  };
});

watchEffect(() => {
  if (dialogRefProps.disabled) {
    dialogRefProps.disabled.value = !parsed.value;
  }
});

async function onConfirm(): Promise<CameraAspectRatio | null> {
  return parsed.value ? (value.value as CameraAspectRatio) : null;
}

defineExpose<CustomDialogComponent>({ onConfirm });
</script>
