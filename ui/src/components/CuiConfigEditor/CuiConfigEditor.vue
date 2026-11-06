<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <span class="text-sm flex-1">{{ $t('views.settings.advanced_info', { file }) }}</span>
      <Button
        v-if="!opened"
        type="button"
        severity="secondary"
        class="cui-button-medium shrink-0"
        :label="$t('views.settings.open_editor', { file })"
        @click="opened = true"
      />
    </div>

    <div v-if="opened" class="flex flex-col gap-4">
      <div class="relative h-[28rem]">
        <Suspense>
          <CuiEditor v-model="content" lang="yaml" :options="options" :read-only="busy" />

          <template #fallback>
            <div class="w-full h-full flex items-center justify-center">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
          </template>
        </Suspense>

        <div class="absolute right-5 bottom-3 z-2 flex flex-col gap-2">
          <Button
            v-tooltip.left="{ value: $t('components.form.tooltip.zoom_in') }"
            type="button"
            severity="secondary"
            rounded
            class="opacity-60 hover:opacity-100 focus:opacity-100 transition"
            :disabled="uiSettings.config.zoom >= CUI_CONFIG_EDITOR_ZOOM.max"
            @click="zoom(1)"
          >
            <template #icon>
              <i-tabler:zoom-in />
            </template>
          </Button>
          <Button
            v-tooltip.left="{ value: $t('components.form.tooltip.zoom_out') }"
            type="button"
            severity="secondary"
            rounded
            class="opacity-60 hover:opacity-100 focus:opacity-100 transition"
            :disabled="uiSettings.config.zoom <= CUI_CONFIG_EDITOR_ZOOM.min"
            @click="zoom(-1)"
          >
            <template #icon>
              <i-tabler:zoom-out />
            </template>
          </Button>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2">
        <Button type="button" severity="secondary" class="cui-button-medium" :label="$t('components.form.button.close')" :disabled="busy" @click="close" />
        <Button type="button" class="cui-button-medium" :label="$t('components.form.button.save')" :loading="busy" :disabled="content === saved" @click="confirmSave" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sleep } from '@camera.ui/common/utils';

import { ConfigQuery } from '@/api/routes/config.js';
import { ServerQuery } from '@/api/routes/server.js';
import { CUI_CONFIG_EDITOR_ZOOM } from './types.js';

import type { Ace } from 'ace-builds';
import type { CuiConfigEditorProps } from './types.js';

const configQuery = new ConfigQuery();
const serverQuery = new ServerQuery();

const props = defineProps<CuiConfigEditorProps>();

const dialog = useCuiDialog();
const { t } = useI18n();
const { beginServerRestart } = useServerRestart();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: configData, isBusy: configLoading } = props.config === 'go2rtc' ? configQuery.getGo2RtcConfigQuery() : configQuery.getConfigQuery();
const { mutateAsync: patchConfig, isPending: patchConfigPending } = configQuery.patchConfigQuery();
const { mutateAsync: patchGo2RtcConfig, isPending: patchGo2RtcConfigPending } = configQuery.patchGo2RtcConfigQuery();
const { mutateAsync: restartServer, isPending: restartServerPending } = serverQuery.restartServerQuery();

const content = ref('');
const opened = ref(false);

const file = computed(() => (props.config === 'go2rtc' ? 'go2rtc.yaml' : 'camera.ui.yaml'));
const saved = computed(() => (configData.value as string | undefined) ?? '');
const busy = computed(() => configLoading.value || patchConfigPending.value || patchGo2RtcConfigPending.value || restartServerPending.value);
const options = computed<Partial<Ace.EditorOptions>>(() => ({ fontSize: uiSettings.value.config.zoom }));

function zoom(step: number): void {
  uiSettings.value.config.zoom = Math.min(Math.max(uiSettings.value.config.zoom + step, CUI_CONFIG_EDITOR_ZOOM.min), CUI_CONFIG_EDITOR_ZOOM.max);
}

function close(): void {
  content.value = saved.value;
  opened.value = false;
}

function confirmSave(): void {
  const go2rtc = props.config === 'go2rtc';
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: go2rtc ? t('views.settings.streaming.editor_confirm') : t('components.dialog.message.confirm_restart_server'),
      confirmText: go2rtc ? t('components.form.button.save') : t('components.form.button.save_and_restart'),
      loading: busy,
    },
    onConfirm: save,
  });
}

async function save(): Promise<void> {
  try {
    if (props.config === 'go2rtc') {
      await patchGo2RtcConfig({ configData: content.value });
      return;
    }
    await patchConfig({ configData: content.value });
    await sleep(500);
    beginServerRestart();
    await restartServer();
  } catch {}
}

watch(
  saved,
  (yaml) => {
    content.value = yaml;
  },
  { immediate: true },
);
</script>
