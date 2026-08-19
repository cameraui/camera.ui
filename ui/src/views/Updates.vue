<template>
  <div>
    <div v-if="!smBreakpoint" class="flex items-center justify-between">
      <h1 class="page-title">
        {{ $t('views.updates.title') }}
      </h1>
      <Button
        v-tooltip.bottom="{ value: $t('views.updates.check_now') }"
        severity="secondary"
        text
        rounded
        class="cui-icon-lg relative z-2"
        :loading="isChecking"
        :disabled="busy"
        @click="updatesStore.refresh()"
      >
        <template #icon>
          <i-mdi:refresh width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="right">
      <Button severity="secondary" class="cui-button p-2 text-color" text rounded :loading="isChecking" :disabled="busy" @click="updatesStore.refresh()">
        <template #icon>
          <i-mdi:refresh width="100%" height="100%" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div v-if="!status" class="w-full flex items-center justify-center py-16">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-col gap-6">
      <Card class="cui-card">
        <template #content>
          <div v-if="runActive" class="flex items-center gap-4">
            <ProgressSpinner class="w-[26px] h-[26px] m-0 shrink-0" stroke-width="5" />
            <div class="flex flex-col field-switch-gap min-w-0 flex-1">
              <span class="text-sm font-bold text-color">
                {{
                  updatingItem
                    ? $t('views.updates.run_updating', { name: updatingItem.name })
                    : restartingItem
                      ? $t('connection.restarting')
                      : $t('views.updates.run_preparing')
                }}
              </span>
              <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                {{ $t('views.updates.run_progress', { done: runDone, total: runTotal }) }}
                <template v-if="serverPending"> · {{ $t('views.updates.run_server_last') }}</template>
              </Message>
            </div>
            <Button
              severity="secondary"
              class="cui-button-medium shrink-0"
              :disabled="cancelRequested"
              :label="cancelRequested ? $t('views.updates.cancelling') : $t('components.form.button.cancel')"
              @click="updatesStore.cancelRun()"
            />
          </div>

          <div v-else-if="allUpToDate" class="flex items-center gap-4">
            <i-mdi:check-circle-outline class="w-7 h-7 shrink-0 text-success" />
            <div class="flex flex-col field-switch-gap min-w-0 flex-1">
              <span class="text-sm font-bold text-color">{{ $t('views.updates.all_up_to_date') }}</span>
              <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                {{ $t('views.updates.checked_at', { time: checkedAtLabel }) }}
              </Message>
            </div>
          </div>

          <div v-else class="flex flex-wrap items-center gap-4">
            <i-mdi:arrow-up-circle-outline class="w-7 h-7 shrink-0 text-primary" />
            <div class="flex flex-col field-switch-gap min-w-0 flex-1">
              <span class="text-sm font-bold text-color">{{ $t('views.updates.pending_count', { count: pendingCount }) }}</span>
              <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                {{ serverPending ? $t('views.updates.summary_server_hint') : $t('views.updates.checked_at', { time: checkedAtLabel }) }}
              </Message>
            </div>
            <Button class="cui-button-medium shrink-0 ml-auto" :disabled="busy" :label="$t('views.updates.update_all')" @click="updatesStore.updateAll()" />
          </div>
        </template>
      </Card>

      <div v-for="section in sections" :key="section.kind">
        <span class="card-title">{{ section.title }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col">
              <div v-for="(item, index) in section.items" :key="item.id" class="flex items-center gap-4 py-3" :class="{ 'border-t border-surface': index > 0 }">
                <ProgressSpinner v-if="item.status === 'updating' || item.status === 'restarting'" class="w-[22px] h-[22px] m-0 shrink-0" stroke-width="5" />
                <i-mdi:check-circle v-else-if="item.status === 'success' || item.status === 'uptodate'" class="w-[22px] h-[22px] shrink-0 text-success" />
                <i-mdi:alert-circle v-else-if="item.status === 'error'" class="w-[22px] h-[22px] shrink-0 text-red-500" />
                <i-mdi:information-outline v-else-if="item.status === 'blocked'" class="w-[22px] h-[22px] shrink-0 text-muted" />
                <i-mdi:arrow-up-circle v-else class="w-[22px] h-[22px] shrink-0 text-primary" />

                <div class="flex flex-col field-switch-gap min-w-0 flex-1">
                  <span class="text-sm font-bold text-color truncate">{{ item.name }}</span>
                  <span v-if="item.packageName" class="text-xs text-muted truncate">{{ item.packageName }}</span>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint truncate">
                    <template v-if="item.status === 'error'">{{ item.error }}</template>
                    <template v-else-if="item.status === 'restarting'">{{ $t('connection.restarting') }}</template>
                    <template v-else-if="item.status === 'blocked'">{{ blockedLabel(item) }}</template>
                    <template v-else-if="item.status === 'uptodate'">v{{ item.installedVersion }} · {{ $t('views.updates.up_to_date') }}</template>
                    <template v-else-if="item.status === 'success'">{{ $t('views.updates.updated_to', { version: item.latestVersion }) }}</template>
                    <template v-else>v{{ item.installedVersion }} → v{{ item.latestVersion }}</template>
                  </Message>
                </div>

                <template v-if="item.status === 'pending' || item.status === 'error'">
                  <Button
                    v-tooltip.top="{ value: $t('components.form.label.changelog') }"
                    severity="secondary"
                    text
                    rounded
                    class="cui-icon-md shrink-0"
                    @click="openChangelog(item)"
                  >
                    <template #icon>
                      <i-mdi:text-box-outline width="100%" height="100%" />
                    </template>
                  </Button>
                  <Button
                    severity="secondary"
                    outlined
                    class="cui-button-medium shrink-0"
                    :disabled="item.kind === 'server' ? busy : runActive || serverBusy"
                    :label="item.status === 'error' ? $t('views.updates.retry') : $t('components.form.button.update')"
                    @click="updatesStore.updateItem(item.id)"
                  />
                </template>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UpdateChangelogDialog from '@/components/CuiDialog/templates/UpdateChangelog/UpdateChangelog.vue';

import type { UpdateChangelogProps } from '@/components/CuiDialog/templates/UpdateChangelog/types.js';
import type { UpdateItem, UpdateKind } from '@/stores/updates.js';

const { t } = useI18n();
const dialog = useCuiDialog();
const { smBreakpoint } = useSharedCuiBreakpoint();

const updatesStore = useUpdatesStore();
const {
  status,
  runActive,
  cancelRequested,
  isChecking,
  checkedAt,
  runTotal,
  runDone,
  pendingCount,
  updatingItem,
  restartingItem,
  serverBusy,
  busy,
  allUpToDate,
  serverPending,
} = storeToRefs(updatesStore);

const sections = computed<{ kind: UpdateKind; title: string; items: UpdateItem[] }[]>(() =>
  (
    [
      { kind: 'server' as const, title: t('views.updates.section_server') },
      { kind: 'plugin' as const, title: t('views.updates.section_plugins') },
      { kind: 'worker' as const, title: t('views.updates.section_workers') },
    ] as const
  )
    .map((section) => ({ ...section, items: updatesStore.itemsOf(section.kind) }))
    .filter((section) => section.items.length > 0),
);

const checkedAtLabel = computed(() => new Date(checkedAt.value).toLocaleTimeString());

function blockedLabel(item: UpdateItem): string {
  if (item.blockedReason === 'legacy') return t('views.updates.blocked_legacy');
  return t('views.updates.blocked_desktop');
}

function openChangelog(item: UpdateItem): void {
  dialog.openComponentDialog<UpdateChangelogProps>(UpdateChangelogDialog, {
    data: {
      title: item.name,
      confirmText: t('components.form.button.update'),
      contentProps: {
        kind: item.kind,
        name: item.packageName ?? item.name,
        version: item.latestVersion,
      },
    },
    onConfirm: () => updatesStore.updateItem(item.id),
  });
}

onMounted(() => {
  updatesStore.connect();
});
</script>
