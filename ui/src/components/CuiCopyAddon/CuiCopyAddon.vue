<template>
  <InputGroupAddon>
    <CuiActionButton
      :action-text="$t('components.form.tooltip.copied')"
      :icon="CopyIcon"
      :button-props="{ severity: 'secondary', text: true }"
      @action="copyToClipboard(value ?? '')"
    />
  </InputGroupAddon>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/fluent/copy-16-filled';

import { copyToClipboard } from '@/common/utils.js';

import type { CuiCopyAddonProps } from './types.js';

defineProps<CuiCopyAddonProps>();
</script>
