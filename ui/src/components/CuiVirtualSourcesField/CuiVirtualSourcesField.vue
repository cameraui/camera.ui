<template>
  <div v-if="offersSources(type, capabilities)" class="flex flex-col field-gap">
    <label for="virtualSources" class="cui-label">{{ $t('components.camera_options.virtual_sensor_sources') }}</label>
    <AutoComplete v-model="sources" input-id="virtualSources" multiple fluid :typeahead="false" placeholder="HDMI 1" />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
      {{ $t('components.camera_options.virtual_sensor_sources_hint') }}
    </Message>
  </div>
</template>

<script setup lang="ts">
import { offersSources } from './types.js';

import type { CuiVirtualSourcesFieldProps } from './types.js';

defineProps<CuiVirtualSourcesFieldProps>();
const sources = defineModel<string[]>({ required: true });
</script>
