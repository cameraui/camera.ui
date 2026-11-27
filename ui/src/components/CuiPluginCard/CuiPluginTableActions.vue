<template>
  <div class="flex items-center justify-end gap-1">
    <Button
      v-if="pluginUpdate?.updateAvailable || updating"
      v-tooltip.top="{
        value: updating
          ? $t(queued ? 'components.plugin_card.update_queued' : 'components.plugin_card.update_running')
          : $t('components.plugin_card.update_now', { version: pluginUpdate?.latestVersion }),
      }"
      text
      rounded
      class="cui-icon-md"
      @click="handleInlineUpdate"
    >
      <template #icon>
        <ProgressSpinner v-if="updating" class="w-4! h-4! m-0" stroke-width="6" />
        <UpdateIcon v-else width="100%" height="100%" />
      </template>
    </Button>

    <Button v-tooltip.top="{ value: $t('components.form.tooltip.console') }" severity="secondary" text rounded class="cui-icon-md" @click="openDialog('console')">
      <template #icon>
        <i-icon-park-outline:terminal width="100%" height="100%" />
      </template>
    </Button>

    <Button severity="secondary" text rounded class="cui-icon-md" :disabled="isLoading" @click="toggleMenu">
      <template #icon>
        <i-mdi:dots-vertical width="100%" height="100%" />
      </template>
    </Button>

    <CuiMenu v-if="overlays.menu" ref="menuRef" :items></CuiMenu>
  </div>
</template>

<script setup lang="ts">
import UpdateIcon from '~icons/material-symbols/deployed-code-update';

import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import { usePluginActions } from './usePluginActions.js';

import type { CameraUiPlugin } from '@shared/types';

const props = defineProps<{ plugin: CameraUiPlugin }>();

const { plugin } = toRefs(props);

const { pluginUpdate, queued, updating, isLoading, items, openDialog, handleInlineUpdate } = usePluginActions(plugin);
const { mounted: overlays, toggleOverlay } = useLazyOverlays<'menu'>();

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');

function toggleMenu(event: MouseEvent): Promise<void> {
  return toggleOverlay('menu', () => menuRef.value?.toggleMenu(event));
}
</script>

<style scoped></style>
