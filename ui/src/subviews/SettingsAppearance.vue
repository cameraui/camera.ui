<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div v-if="!isHaPanel()">
        <span class="card-title">{{ $t('views.settings.theme') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('components.form.label.theme') }}</label>
                <Select v-model="theme" :options="colors" :disabled="autoMode" />
              </div>

              <div class="w-full flex flex-col gap-2">
                <div class="flex flex-col field-gap cui-toggle-switch">
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label class="cui-label-switch">{{ $t('components.form.label.system_preference') }}</label>

                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                        $t('components.form.hint.system_preference')
                      }}</Message>
                    </div>

                    <ToggleSwitch v-model="autoMode" class="ml-auto shrink-0" />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="!isHaPanel()">
        <span class="card-title">{{ $t('views.settings.locale') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('components.form.label.language') }}</label>
                <Select v-model="language" :options="languageOptions" option-label="label" option-value="value" />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="!compact">
        <span class="card-title">{{ $t('views.settings.interface') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('components.form.label.default_landing_page') }}</label>
                <Select v-model="uiSettings.interface.landingPage" :options="landingOptions" option-label="label" option-value="value" />

                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.default_landing_page') }}</Message>
              </div>

              <div v-if="hasPermission(undefined, 'admin')" class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('components.form.label.default_settings_page') }}</label>
                <Select v-model="uiSettings.interface.selectedSettingsView" :options="settingsViewOptions" option-label="label" option-value="value" />

                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.default_settings_page') }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('components.form.label.table_rows') }}</label>
                <Select v-model="uiSettings.interface.tableRows" :options="tableRowsOptions" />

                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.table_rows') }}</Message>
              </div>

              <div class="w-full flex flex-col gap-2">
                <div class="flex flex-col field-gap cui-toggle-switch">
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label class="cui-label-switch">{{ $t('components.form.label.navbar_stay_collapsed') }}</label>

                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                        $t('components.form.hint.navbar_stay_collapsed')
                      }}</Message>
                    </div>

                    <ToggleSwitch v-model="uiSettings.interface.navbarStayCollapsed" class="ml-auto shrink-0" />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="!compact">
        <span class="card-title">{{ $t('views.settings.navigation') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="w-full flex flex-col gap-2">
              <div class="flex flex-col field-gap cui-toggle-switch">
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label class="cui-label-switch">{{ $t('components.form.label.nav_settings_in_nav') }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                      $t('components.form.hint.nav_settings_in_nav')
                    }}</Message>
                  </div>

                  <ToggleSwitch :model-value="settingsInNav" class="ml-auto shrink-0" @update:model-value="(value: boolean) => setSettingsInNav(value)" />
                </div>
              </div>

              <div v-for="group in collapsibleGroups" :key="group" class="flex flex-col field-gap cui-toggle-switch">
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label class="cui-label-switch">{{ $t('components.form.label.nav_group_collapsible', { group: $t(`navigation.group_${group}`) }) }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                      $t('components.form.hint.nav_group_collapsible', { group: $t(`navigation.group_${group}`) })
                    }}</Message>
                  </div>

                  <ToggleSwitch :model-value="isCollapsible(group)" class="ml-auto shrink-0" @update:model-value="(value: boolean) => setCollapsible(group, value)" />
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.debugging') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="w-full flex flex-col gap-2">
              <div class="flex flex-col field-gap cui-toggle-switch">
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label class="cui-label-switch">{{ $t('components.form.label.debug_verbose') }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.debug_verbose') }}</Message>
                  </div>

                  <ToggleSwitch :model-value="debugOn" class="ml-auto shrink-0" @update:model-value="setDebug" />
                </div>
              </div>

              <div class="flex flex-col field-gap cui-toggle-switch">
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label class="cui-label-switch">{{ $t('components.form.label.record_logs') }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.record_logs') }}</Message>
                  </div>

                  <ToggleSwitch :model-value="recording" class="ml-auto shrink-0" @update:model-value="setRecording" />
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Logger } from '@camera.ui/logger';

import { isHaPanel } from '@/common/base.js';
import { landingPageRoutes } from '@/router/index.js';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const { t } = useI18n();
const { settingsInNav, isCollapsible, setCollapsible, setSettingsInNav } = useNavLayout();

const localeStore = useLocaleStore();
const { language, languageOptions } = storeToRefs(localeStore);

const themeStore = useThemeStore();
const { colors, theme, autoMode } = storeToRefs(themeStore);

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const recording = ref(Logger.isRecording());
const debugOn = ref(Logger.isDebug());

const tableRowsOptions = [5, 10, 15, 25, 50, 100];

const collapsibleGroups = computed<NavLayoutGroup[]>(() => [...NAV_GROUPS, ...(settingsInNav.value ? (['settings'] as const) : [])]);

const landingOptions = computed(() =>
  landingPageRoutes().map((route) => ({
    label: t(`navigation.${route.meta!.name as string}`),
    value: route.path,
  })),
);

const settingsViewOptions = computed(() =>
  settingsViews.map((view) => ({
    label: t(`navigation.${view}`),
    value: view,
  })),
);

const offFlags = Logger.onChange(() => {
  recording.value = Logger.isRecording();
  debugOn.value = Logger.isDebug();
});

function setRecording(value: boolean): void {
  Logger.setRecording(value);
  if (!value) Logger.clear();
}

function setDebug(value: boolean): void {
  Logger.setDebug(value);
}

onUnmounted(offFlags);
</script>

<style scoped></style>
