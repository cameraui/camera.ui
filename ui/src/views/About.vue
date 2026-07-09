<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t('views.about.title') }}
    </h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.about.versions') }}</span>
        <Card class="cui-card h-auto!" :pt="{ content: { class: 'flex flex-col justify-center' } }">
          <template #content>
            <div class="flex flex-col gap-2">
              <div v-if="appVersion" class="flex flex-row items-center justify-between">
                <span class="text-sm">{{ $t('views.about.version_app') }}</span>
                <span class="text-sm font-bold">
                  v{{ appVersion }}<span v-if="nativeVersion && nativeVersion !== appVersion" class="text-muted font-normal"> ({{ nativeVersion }})</span>
                </span>
              </div>
              <Divider v-if="appVersion" />
              <div class="flex flex-row items-center justify-between">
                <span class="text-sm">{{ $t('views.about.version_server') }}</span>
                <span class="text-sm font-bold">{{ serverVersion ? `v${serverVersion}` : '—' }}</span>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ApiQuery } from '@/api/routes/api.js';

const apiQuery = new ApiQuery();

const { smBreakpoint } = useSharedCuiBreakpoint();
const { appVersion, nativeVersion, refreshAppVersion } = useAppVersion();

const { data: apiInfo } = apiQuery.apiInfoQuery();

const serverVersion = computed(() => apiInfo.value?.version ?? '');

refreshAppVersion();
</script>
