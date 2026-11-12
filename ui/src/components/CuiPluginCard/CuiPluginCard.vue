<template>
  <div
    class="relative"
    :style="{
      height: `${PLUGIN_CARD_SIZE.HEIGHT}px`,
    }"
  >
    <div v-if="selectionMode" class="absolute inset-0 z-4 cursor-pointer" @click="$emit('select')"></div>

    <Card class="cui-card" :pt="{ body: { class: 'justify-between h-full' } }">
      <template #content>
        <div class="flex flex-col h-full">
          <div class="flex items-center w-full gap-4">
            <div
              v-if="selectionMode"
              class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
              :class="selected ? 'bg-primary border-primary' : 'border-color'"
            >
              <i-mdi:check v-if="selected" class="w-4 h-4 text-white" />
            </div>
            <div class="w-16 h-16 relative rounded-full flex-shrink-0 border-2 border-color">
              <Badge class="absolute right-0 bottom-0 min-w-6 w-6 h-6 rounded-full card-background overflow-hidden p-0 border-4 z-1">
                <template #default>
                  <CuiPythonIcon v-if="plugin?.isPython" class="w-[24px]" />
                  <CuiGoIcon v-else-if="plugin?.isGo" class="w-[24px] bg-white" />
                  <CuiJavascriptIcon v-else class="w-[24px]" />
                </template>
              </Badge>
              <CuiImage :src="pluginLogo" alt="Plugin icon" class="block rounded-full overflow-hidden w-full h-full" image-container-class="w-full h-full" />
            </div>

            <RouterLink :to="`/plugins/${plugin.pluginName}`" class="flex flex-col items-start justify-center min-w-0 flex-grow">
              <div class="flex gap-1 items-center min-w-0 w-full">
                <h3 class="text-xl font-semibold truncate">{{ plugin.displayName || 'Plugin Name' }}</h3>
                <i-icon-park-solid:up-c
                  v-if="pluginUpdate?.updateAvailable"
                  v-tooltip="{ value: $t('components.form.tooltip.update_available') }"
                  class="text-green-500 flex-shrink-0"
                />
                <i-ic:round-warning v-if="compatWarnings.length" v-tooltip="{ value: compatWarnings.join(' · ') }" class="text-yellow-500 flex-shrink-0" />
              </div>
              <span class="text-xs text-muted truncate max-w-full">{{ plugin.pluginName }}</span>
            </RouterLink>

            <ToggleSwitch :model-value="state" class="ml-auto flex-shrink-0" pt:handle:class="bg-white" :disabled="isLoading" @change="togglePlugin" />
          </div>

          <p v-tooltip.bottom="{ value: plugin.description }" class="text-sm text-muted my-4 line-clamp-2">
            {{ plugin.description }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center space-x-1">
          <Button severity="secondary" rounded class="cui-button text-xs p-1 font-bold gap-0" @click="$router.absUrl(plugin.links?.homepage)">
            <span>v{{ plugin.installedVersion || plugin.latestVersion }}</span>
            <i-gg:external class="mb-[1px] ml-1" />
          </Button>

          <Button
            v-if="plugin.restartRequired"
            v-tooltip.top="{ value: $t('components.plugin_card.restart_required') }"
            severity="warn"
            text
            rounded
            class="cui-icon-md"
            :disabled="isLoading"
            @click="openDialog('restart')"
          >
            <template #icon>
              <RestartIcon width="100%" height="100%" />
            </template>
          </Button>

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

          <div class="ml-auto"></div>

          <Badge
            v-tooltip.top="{ value: statusTooltip }"
            class="min-w-3 w-3 h-3 mr-3"
            :style="{
              background: pluginsSocket.statusColor.value,
            }"
          ></Badge>

          <Button v-tooltip.top="{ value: $t('components.form.tooltip.console') }" severity="secondary" text rounded class="cui-icon-md" @click="openDialog('console')">
            <template #icon>
              <i-icon-park-outline:terminal width="100%" height="100%" />
            </template>
          </Button>

          <CuiPluginOAuthButton v-if="isOAuthCapable" :plugin-name="plugin.pluginName" :route-to="isNvr ? '/settings/recordings' : undefined" />

          <Button
            v-if="isNvr"
            v-tooltip.top="{ value: $t('components.form.tooltip.nvr_settings') }"
            severity="secondary"
            text
            rounded
            class="cui-icon-md"
            @click="$router.push('/settings/recordings')"
          >
            <template #icon>
              <i-mdi:cog width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.top="{ value: pluginUpdate?.updateAvailable ? $t('components.form.tooltip.update_available') : '' }"
            severity="secondary"
            text
            rounded
            class="cui-icon-md"
            :disabled="isLoading"
            @click="toggleMenu"
          >
            <template #icon>
              <div class="relative w-6 h-6">
                <div
                  class="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                  :class="{
                    'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': menuRef?.isOpen,
                    'bg-primary-500': pluginUpdate?.updateAvailable,
                  }"
                />
                <div
                  class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full transition-all duration-100 bg-current"
                  :class="{
                    'opacity-0 scale-0': menuRef?.isOpen,
                    'bg-primary-500': pluginUpdate?.updateAvailable,
                  }"
                />
                <div
                  class="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                  :class="{
                    'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': menuRef?.isOpen,
                    'bg-primary-500': pluginUpdate?.updateAvailable,
                  }"
                />
              </div>
            </template>
          </Button>
        </div>
      </template>
    </Card>

    <CuiMenu
      v-if="overlays.menu"
      ref="menuRef"
      :items
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    ></CuiMenu>
  </div>
</template>

<script setup lang="ts">
import { hasInterface, PluginInterface } from '@camera.ui/sdk';
import UpdateIcon from '~icons/material-symbols/deployed-code-update';
import RestartIcon from '~icons/iconamoon/restart-bold';

import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import { PluginsQuery } from '@/api/routes/plugins.js';
import CuiPluginOAuthButton from './CuiPluginOAuthButton.vue';
import { PLUGIN_CARD_SIZE } from './types.js';
import { usePluginActions } from './usePluginActions.js';

import type { CuiPluginCardProps } from './types.js';

const pluginsQuery = new PluginsQuery();

const props = defineProps<CuiPluginCardProps>();

defineEmits<{ select: [] }>();

const { t } = useI18n();
const { statusWithPlacement } = usePlacementLabel();

const { plugin } = toRefs(props);

const { pluginsSocket, pluginUpdate, state, queued, updating, isLoading, items, togglePlugin, openDialog, handleInlineUpdate } = usePluginActions(plugin);
const { mounted: overlays, toggleOverlay } = useLazyOverlays<'menu'>();

const { data: pluginLogo } = pluginsQuery.getPluginLogoQuery(plugin.value.pluginName);

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');

const isNvr = plugin.value.contract && hasInterface(plugin.value.contract, PluginInterface.NVR);
const isOAuthCapable = plugin.value.contract && hasInterface(plugin.value.contract, PluginInterface.OAuthCapable);

const compatWarnings = computed<string[]>(() => {
  const warnings: string[] = [];

  if (!plugin.value.compatible) {
    const parts: string[] = [];
    if (plugin.value.os?.length) parts.push(`os ${plugin.value.os.join('/')}`);
    if (plugin.value.cpu?.length) parts.push(`cpu ${plugin.value.cpu.join('/')}`);
    if (plugin.value.libc?.length) parts.push(`libc ${plugin.value.libc.join('/')}`);
    warnings.push(t('components.plugin_card.compat_platform', { requirement: parts.join(', ') }));
  }

  for (const issue of plugin.value.engineIssues ?? []) {
    const engine = issue.engine === 'node' ? 'Node.js' : 'camera.ui';
    warnings.push(t('components.plugin_card.compat_engine', { engine, required: issue.required, current: issue.current }));
  }

  if (plugin.value.protocolCompat === 'pluginTooOld') {
    warnings.push(t('components.plugin_card.compat_protocol_plugin'));
  } else if (plugin.value.protocolCompat === 'serverTooOld') {
    warnings.push(t('components.plugin_card.compat_protocol_server'));
  }

  return warnings;
});

const statusTooltip = computed(() => statusWithPlacement(t(`components.plugin_card.status_${pluginsSocket.status.value}`), pluginsSocket.placement.value));

function toggleMenu(event: MouseEvent): Promise<void> {
  return toggleOverlay('menu', () => menuRef.value?.toggleMenu(event));
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
