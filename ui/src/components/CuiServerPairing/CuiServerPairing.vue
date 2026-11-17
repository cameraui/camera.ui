<template>
  <div class="flex flex-col gap-4">
    <Message severity="error" variant="simple" size="small" class="text-primary">
      {{ $t('views.settings.pair_instructions') }}
    </Message>

    <div class="cui-pair-layout" :class="{ 'cui-pair-layout-stacked': stacked }">
      <div class="cui-pair-qr">
        <CuiQRCode :value="url" :size="180" :logo-size="36" />
      </div>

      <div class="flex flex-col gap-4 flex-1 min-w-0 w-full">
        <div class="flex flex-col field-gap">
          <label class="cui-label">{{ $t('views.settings.pair_code') }}</label>
          <InputGroup>
            <InputText :model-value="code ?? ''" readonly class="font-mono text-lg text-center tracking-widest" />
            <CuiCopyAddon :value="code ?? ''" />
          </InputGroup>
          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.pair_code_hint') }}</Message>
        </div>

        <div class="flex flex-col field-gap">
          <label class="cui-label">{{ $t('views.settings.pair_url') }}</label>
          <InputGroup>
            <InputText :model-value="url" readonly class="font-mono text-sm" />
            <CuiCopyAddon :value="url" />
            <InputGroupAddon>
              <Button v-tooltip="{ value: $t('components.form.button.open_in_browser') }" type="button" severity="secondary" text @click="$router.absUrl(url)">
                <template #icon>
                  <OpenIcon />
                </template>
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </div>

        <div class="flex items-center gap-3">
          <ProgressSpinner class="w-[20px] h-[20px] m-0" stroke-width="5" />
          <span class="text-sm">{{ $t('views.settings.pair_waiting', { remaining: countdown }) }}</span>
          <slot name="actions" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import OpenIcon from '~icons/fluent/open16-filled';

import type { CuiServerPairingProps } from './types.js';

defineProps<CuiServerPairingProps>();

const { code, url, countdown } = useServerPairing();
</script>

<style scoped>
.cui-pair-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .cui-pair-layout:not(.cui-pair-layout-stacked) {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
  }
}

.cui-pair-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
</style>
