<template>
  <div class="flex flex-col">
    <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('components.form.label.changelog') }}</h3>

    <div v-if="isLoading" class="flex items-center justify-center py-10">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>
    <CuiMarkdownContent v-else-if="changelog" :content="changelog" />
    <span v-else class="text-sm text-muted">{{ $t('views.updates.no_changelog') }}</span>
  </div>
</template>

<script setup lang="ts">
import { getPluginChangelogFn } from '@/api/routes/plugins.js';
import { getServerChangelogFn } from '@/api/routes/server.js';
import { asyncComponent } from '@/common/asyncComponent.js';

import type { UpdateChangelogProps } from './types.js';

const CuiMarkdownContent = asyncComponent(() => import('@/components/CuiMarkdownContent/CuiMarkdownContent.vue'));

const props = defineProps<UpdateChangelogProps>();

const changelog = ref('');
const isLoading = ref(true);

onMounted(async () => {
  const controller = new AbortController();
  try {
    if (props.kind === 'plugin') {
      changelog.value =
        (await getPluginChangelogFn({
          pluginName: props.name,
          query: props.version ? { pluginversion: props.version } : undefined,
          signal: controller.signal,
        })) ?? '';
    } else {
      // workers follow the server release, show the server changelog
      changelog.value = (await getServerChangelogFn({ version: props.version ?? 'latest', signal: controller.signal })) ?? '';
    }
  } catch {
    changelog.value = '';
  } finally {
    isLoading.value = false;
  }
});
</script>
