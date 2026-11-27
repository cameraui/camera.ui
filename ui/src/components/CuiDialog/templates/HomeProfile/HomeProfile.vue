<template>
  <div class="flex w-full flex-col gap-5 text-pretty">
    <div class="flex flex-col field-gap">
      <label for="homeProfileName" class="cui-label">{{ t('components.form.label.name') }}</label>
      <InputText id="homeProfileName" v-model="name" :placeholder maxlength="60" fluid autofocus />
    </div>

    <div v-if="copyOf !== undefined" class="flex flex-col field-gap">
      <span class="cui-label">{{ t('views.home_dashboard.profile_start') }}</span>
      <SelectButton v-model="copy" :options="starts" option-label="label" option-value="value" :allow-empty="false" fluid />
    </div>

    <div v-if="!isDefault" class="flex flex-col gap-3">
      <div class="flex flex-col field-gap">
        <span class="cui-label">{{ t('views.home_dashboard.profile_rule') }}</span>
        <SelectButton v-model="orientation" :options="orientations" option-label="label" option-value="value" :allow-empty="false" fluid />
      </div>
      <div class="home-profile__sizes">
        <template v-for="row in rows" :key="row.label">
          <span class="text-sm text-color">{{ row.label }}</span>
          <InputNumber v-model="row.min.value" :min="0" :max="20000" :use-grouping="false" suffix=" px" :placeholder="t('views.home_dashboard.profile_from')" fluid />
          <InputNumber v-model="row.max.value" :min="0" :max="20000" :use-grouping="false" suffix=" px" :placeholder="t('views.home_dashboard.profile_to')" fluid />
        </template>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="cui-input-hint">{{ t(`views.home_dashboard.profile_window_${landscape ? 'landscape' : 'portrait'}`, { width, height }) }}</span>
        <Button text size="small" class="shrink-0" :label="t('views.home_dashboard.profile_take_window')" @click="takeWindow" />
      </div>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('views.home_dashboard.profile_rule_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { DBHomeOrientation, DBHomeProfileRule } from '@shared/types';
import type { HomeProfileProps, HomeProfileResult } from './types.js';

const props = defineProps<HomeProfileProps>();

const { t } = useI18n();
const { width, height } = useWindowSize();

const name = ref(props.name ?? '');
const copy = ref(true);
const orientation = ref<DBHomeOrientation | 'any'>(props.rule?.orientation ?? 'any');
const minWidth = ref(props.rule?.minWidth ?? null);
const maxWidth = ref(props.rule?.maxWidth ?? null);
const minHeight = ref(props.rule?.minHeight ?? null);
const maxHeight = ref(props.rule?.maxHeight ?? null);

const starts = computed(() => [
  { value: false, label: t('views.home_dashboard.profile_empty') },
  { value: true, label: t('views.home_dashboard.profile_copy', { name: props.copyOf }) },
]);
const orientations = computed(() => [
  { value: 'any', label: t('views.home_dashboard.profile_any') },
  { value: 'portrait', label: t('views.home_dashboard.profile_portrait') },
  { value: 'landscape', label: t('views.home_dashboard.profile_landscape') },
]);
const landscape = computed(() => width.value >= height.value);
const rows = computed(() => [
  { label: t('views.home_dashboard.profile_width'), min: minWidth, max: maxWidth },
  { label: t('views.home_dashboard.profile_height'), min: minHeight, max: maxHeight },
]);

function takeWindow() {
  orientation.value = landscape.value ? 'landscape' : 'portrait';
  minWidth.value = width.value;
  maxWidth.value = width.value;
  minHeight.value = null;
  maxHeight.value = null;
}

function ruleOf(): DBHomeProfileRule | undefined {
  const [fromWidth, toWidth] = ordered(minWidth.value, maxWidth.value);
  const [fromHeight, toHeight] = ordered(minHeight.value, maxHeight.value);
  const next: DBHomeProfileRule = {
    ...(orientation.value !== 'any' && { orientation: orientation.value }),
    ...(fromWidth !== undefined && { minWidth: fromWidth }),
    ...(toWidth !== undefined && { maxWidth: toWidth }),
    ...(fromHeight !== undefined && { minHeight: fromHeight }),
    ...(toHeight !== undefined && { maxHeight: toHeight }),
  };
  return Object.keys(next).length ? next : undefined;
}

function ordered(min: number | null, max: number | null): [number | undefined, number | undefined] {
  // a range typed the wrong way round still means the range
  if (min !== null && max !== null && min > max) return [max, min];
  return [min ?? undefined, max ?? undefined];
}

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<HomeProfileResult> => ({
    name: name.value.trim() || undefined,
    rule: props.isDefault ? undefined : ruleOf(),
    copy: props.copyOf !== undefined && copy.value,
  }),
});
</script>

<style scoped>
.home-profile__sizes {
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
</style>
