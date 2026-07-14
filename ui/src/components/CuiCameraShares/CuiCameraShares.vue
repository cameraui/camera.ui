<template>
  <div class="flex flex-col gap-3">
    <CuiDataTable :value="shares" :loading="isLoading" striped-rows size="small" class="text-sm">
      <template #empty>
        <div class="text-center text-muted py-4">{{ $t('shares.no_shares') }}</div>
      </template>
      <Column field="label" :header="$t('shares.label')">
        <template #body="{ data }">{{ data.label || '\u2014' }}</template>
      </Column>
      <Column field="sourceName" :header="$t('shares.source')">
        <template #body="{ data }">{{ data.sourceName || '\u2014' }}</template>
      </Column>
      <Column field="createdAt" :header="$t('shares.created')">
        <template #body="{ data }">{{ formatDate(data.createdAt) }}</template>
      </Column>
      <Column field="expiresAt" :header="$t('shares.expires')">
        <template #body="{ data }">{{ formatDate(data.expiresAt) }}</template>
      </Column>
      <Column :header="$t('shares.viewers')">
        <template #body="{ data }"> {{ data.currentViewers }}{{ data.maxViewers > 0 ? ` / ${data.maxViewers}` : '' }} </template>
      </Column>
      <Column class="w-24">
        <template #body="{ data }">
          <div class="flex gap-1 justify-end">
            <CuiActionButton
              :action-text="$t('components.form.tooltip.copied')"
              :icon="CopyIcon"
              icon-class="w-full h-full"
              :button-props="{
                severity: 'secondary',
                text: true,
                rounded: true,
                class: 'cui-icon-md',
              }"
              @action="copy(`${SHARE_SERVICE_URL}/${data._id}`)"
            />
            <Button v-tooltip.top="$t('shares.revoke')" text rounded severity="danger" class="cui-icon-md" @click="onRevoke(data._id)">
              <template #icon>
                <DeleteIcon width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </template>
      </Column>
    </CuiDataTable>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/fluent/copy-16-filled';
import DeleteIcon from '~icons/fluent/delete-16-filled';

import { SharesQuery } from '@/api/routes/shares.js';
import { SHARE_SERVICE_URL } from '@/common/constants.js';
import { copyToClipboard as copy } from '@/common/utils.js';

import type { CuiCameraSharesProps } from './types.js';

const sharesQuery = new SharesQuery();

const props = defineProps<CuiCameraSharesProps>();

const { data: sharesData, isLoading } = sharesQuery.getSharesQuery(computed(() => props.cameraId));
const { mutateAsync: revokeShare } = sharesQuery.revokeShareQuery();

const shares = computed(() => sharesData.value ?? []);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function onRevoke(token: string) {
  await revokeShare({ token });
}
</script>
