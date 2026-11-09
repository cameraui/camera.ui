<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.permissions.general') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.permissions.general_info') }}</span>

              <div class="flex flex-col gap-6">
                <CuiToggleRow v-for="row in rows" :key="row.name" plain :label="$t(`views.settings.permissions.${row.name}`)">
                  <template #hint>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                      {{ $t(`views.settings.permissions.${row.name}_info`) }}
                    </Message>
                    <Message v-if="states[row.name] === 'denied' && !canOpenSettings" severity="warn" variant="simple" size="small" class="cui-input-switch-hint">
                      {{ $t('views.settings.permissions.browser_hint') }}
                    </Message>
                  </template>
                  <div class="flex items-center gap-2">
                    <Tag :severity="stateSeverity(states[row.name])" :value="$t(`views.settings.permissions.state_${states[row.name]}`)" />
                    <Button
                      v-if="states[row.name] === 'prompt' || states[row.name] === 'unknown'"
                      :loading="busy === row.name"
                      class="cui-button-small"
                      :label="$t('views.settings.permissions.request')"
                      @click="onRequest(row.name)"
                    />
                    <Button
                      v-else-if="states[row.name] === 'denied' && canOpenSettings"
                      severity="secondary"
                      class="cui-button-small"
                      :label="$t('views.settings.permissions.open_settings')"
                      @click="openSettings"
                    />
                  </div>
                </CuiToggleRow>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AppPermissionName, AppPermissionState } from '@/composables/usePermissions.js';

const { states, canOpenSettings, refresh, request, openSettings } = usePermissions();

const rows: { name: AppPermissionName }[] = [{ name: 'microphone' }, { name: 'location' }, { name: 'notifications' }];

const busy = ref<AppPermissionName | null>(null);

function stateSeverity(state: AppPermissionState): 'success' | 'danger' | 'warn' | 'secondary' {
  if (state === 'granted') return 'success';
  if (state === 'denied') return 'danger';
  if (state === 'prompt') return 'warn';
  return 'secondary';
}

async function onRequest(name: AppPermissionName) {
  busy.value = name;
  try {
    await request(name);
  } finally {
    busy.value = null;
  }
}

useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

onMounted(() => {
  refresh();
});
</script>
