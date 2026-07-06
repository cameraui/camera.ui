<template>
  <div class="flex flex-col gap-6">
    <div v-if="!shareResult" class="flex flex-col gap-4">
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('shares.source') }}</label>
        <Select v-model="sourceId" :options="sourceOptions" option-label="label" option-value="value" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('shares.ttl') }}</label>
        <Select v-model="ttl" :options="ttlOptions" option-label="label" option-value="value" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('shares.max_viewers') }}</label>
        <Select v-model="maxViewers" :options="maxViewerOptions" option-label="label" option-value="value" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('shares.label') }}</label>
        <InputText v-model="label" :placeholder="$t('shares.label_placeholder')" class="w-full" />
      </div>
    </div>

    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('shares.link') }}</label>
        <InputGroup>
          <InputText :model-value="shareResult.link" readonly class="w-full font-mono text-sm" />
          <InputGroupAddon>
            <CuiActionButton
              :action-text="$t('components.form.tooltip.copied')"
              :icon="CopyIcon"
              :button-props="{
                severity: 'secondary',
                text: true,
              }"
              @action="copy(shareResult!.link)"
            />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('shares.code') }}</label>
        <InputGroup>
          <InputText :model-value="shareResult.code" readonly class="w-full font-mono text-lg tracking-widest text-center" />
          <InputGroupAddon>
            <CuiActionButton
              :action-text="$t('components.form.tooltip.copied')"
              :icon="CopyIcon"
              :button-props="{
                severity: 'secondary',
                text: true,
              }"
              @action="copy(shareResult!.code)"
            />
          </InputGroupAddon>
        </InputGroup>
        <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('shares.code_save_hint') }}</Message>
      </div>

      <Button v-if="canShare" :label="$t('shares.share')" class="w-full cui-button-medium" @click="shareNative" />
    </div>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/fluent/copy-16-filled';

import { SharesQuery } from '@/api/routes/shares.js';

import type { ShareCreateResult } from '@/api/routes/shares.js';
import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ShareFormProps } from './types.js';

const sharesQuery = new SharesQuery();

const props = defineProps<ShareFormProps>();

const { t } = useI18n();
const { copy } = useClipboard({ legacy: true });
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: createShare, isPending: createLoading } = sharesQuery.createShareQuery();

const ttlOptions = [
  { label: '1 ' + t('shares.hour'), value: 1 },
  { label: '24 ' + t('shares.hours'), value: 24 },
  { label: '7 ' + t('shares.days'), value: 168 },
  { label: '30 ' + t('shares.days'), value: 720 },
];
const maxViewerOptions = [
  { label: t('shares.unlimited'), value: 0 },
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
];

const sourceOptions = props.sources.map((s) => ({ label: s.name, value: s._id }));

const ttl = ref(24);
const maxViewers = ref(0);
const label = ref('');
const sourceId = ref(props.sources.find((s) => s.role === 'high-resolution')?._id ?? props.sources[0]?._id ?? '');
const shareResult = ref<ShareCreateResult | null>(null);

const canShare = computed(() => !!navigator.share);
const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || createLoading.value));

async function shareNative() {
  if (!shareResult.value) return;
  try {
    await navigator.share({
      title: t('shares.share_title'),
      text: `${shareResult.value.link}\n\n${t('shares.code')}: ${shareResult.value.code}`,
    });
  } catch {
    // User cancelled or share failed — ignore
  }
}

async function onConfirm(): Promise<void | null> {
  if (shareResult.value) return;

  let result: ShareCreateResult;
  try {
    result = await createShare({
      shareData: {
        cameraId: props.cameraId,
        sourceId: sourceId.value,
        ttlHours: ttl.value,
        maxViewers: maxViewers.value,
        label: label.value || undefined,
      },
    });
  } catch {
    return null;
  }

  shareResult.value = result;
  dialogRefProps.confirmText!.value = t('shares.done');
  return null;
}

defineExpose<CustomDialogComponent>({
  isLoading,
  onConfirm,
});
</script>
