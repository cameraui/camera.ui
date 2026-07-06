<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ t('views.automations.title') }}
    </h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div class="flex gap-2 mb-4">
      <IconField class="flex-1">
        <InputIcon>
          <i-carbon:search class="w-4 h-4" />
        </InputIcon>
        <InputText v-model="searchQuery" :placeholder="t('views.automations.search')" class="w-full" />
      </IconField>
      <Button
        v-if="isAdmin"
        v-tooltip.left="{ value: t('views.automations.browse_community') }"
        severity="secondary"
        outlined
        class="cui-button shrink-0"
        @click="openStore"
      >
        <template #icon>
          <i-mdi:store-search class="w-4.5 h-4.5" />
        </template>
      </Button>
      <Button v-tooltip="{ value: t('views.automations.import_blueprint') }" severity="secondary" outlined class="cui-button shrink-0" @click="triggerImport">
        <template #icon>
          <i-carbon:download class="w-4.5 h-4.5" />
        </template>
      </Button>
      <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="onFileSelected" />
    </div>

    <Transition name="fade-2" mode="out-in">
      <div
        v-if="isLoading"
        key="loading"
        class="grid w-full gap-2"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : `${CARD_MIN_WIDTH}px`}, 1fr))`,
        }"
      >
        <Skeleton v-for="i in skeletonCount" :key="i" :height="`${CARD_HEIGHT}px`" class="cui-card" />
      </div>

      <div
        v-else-if="filteredFlows.length"
        key="content"
        class="grid w-full gap-2"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : `${CARD_MIN_WIDTH}px`}, 1fr))`,
        }"
      >
        <CuiAutomationFlowCard
          v-for="flow in filteredFlows"
          :key="flow._id"
          :flow
          @click="openFlow(flow._id)"
          @toggle="(val: boolean) => patchFlow({ id: flow._id, data: { enabled: val } })"
          @delete="confirmDelete(flow._id)"
        />
      </div>

      <div v-else key="empty" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-20">
        <i-material-symbols:automation class="w-12 h-12 text-muted" />
        <span class="text-muted text-sm">{{ t('views.automations.no_automations') }}</span>
      </div>
    </Transition>

    <CuiFloatingButton
      :tooltip-props="{ value: t('views.automations.create') }"
      :button-props="{ class: 'text-white' }"
      :icon="PlusIcon"
      :icon-props="{ width: '30px', height: '30px' }"
      @click="createNewFlow"
    />
  </div>
</template>

<script lang="ts" setup>
import PlusIcon from '~icons/typcn/plus';

import { AutomationsQuery } from '@/api/routes/automations.js';
import { asyncComponent } from '@/common/asyncComponent.js';

import type { AutomationStoreBlueprint } from '@/components/CuiAutomation/types.js';

const AutomationStoreDialog = asyncComponent(() => import('@/components/CuiDialog/templates/AutomationStore/AutomationStore.vue'));
const AutomationImportDialog = asyncComponent(() => import('@/components/CuiDialog/templates/AutomationImport/AutomationImport.vue'));

const automationsQuery = new AutomationsQuery();

const router = useRouter();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth, height: windowHeight } = useSharedWindowSize();

const { data: flowsData, isBusy: isLoading } = automationsQuery.getAutomationsQuery();
const { mutateAsync: patchFlow } = automationsQuery.patchAutomationQuery();
const { mutateAsync: removeFlow, isPending: isDeleting } = automationsQuery.deleteAutomationQuery();

const CARD_MIN_WIDTH = 350;
const CARD_HEIGHT = 114;

const searchQuery = ref('');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');

const isAdmin = computed(() => hasPermission(undefined, 'admin'));

const flows = computed(() => flowsData.value ?? []);

const skeletonCount = computed(() => {
  const cols = smBreakpoint.value ? 1 : Math.max(1, Math.floor(windowWidth.value / CARD_MIN_WIDTH));
  const rows = Math.max(1, Math.ceil(windowHeight.value / (CARD_HEIGHT + 8)));
  return cols * rows;
});

const filteredFlows = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return flows.value;
  return flows.value.filter((f) => f.name.toLowerCase().includes(query));
});

function openFlow(flowId: string) {
  router.push(`/automations/${flowId}`);
}

function createNewFlow() {
  router.push('/automations/new');
}

function openStore() {
  dialog.openComponentDialog(AutomationStoreDialog, {
    data: {
      title: t('views.automations.browse_community'),
      contentProps: {},
      hideConfirmButton: true,
      fullscreen: true,
    },
  });
}

function openImportWizard(blueprint: AutomationStoreBlueprint) {
  // Loose generic: DeepMaybeRef over the blueprint's VueFlow node type is too deep to instantiate.
  dialog.openComponentDialog<Record<string, unknown>>(AutomationImportDialog, {
    data: {
      title: t('components.automation_import.title'),
      confirmText: t('components.automation_import.import'),
      contentProps: { blueprint },
    },
  });
}

function triggerImport() {
  fileInputRef.value?.click();
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const blueprint = JSON.parse(text) as AutomationStoreBlueprint;

    if (!blueprint.version || !blueprint.nodes || !blueprint.edges) {
      toast.add({ severity: 'error', detail: t('views.automations.import_invalid'), life: 3000 });
      return;
    }

    // Route file imports through the binding wizard so references get rebound to this install.
    openImportWizard(blueprint);
  } catch {
    toast.add({ severity: 'error', detail: t('views.automations.import_invalid'), life: 3000 });
  }

  if (fileInputRef.value) fileInputRef.value.value = '';
}

function confirmDelete(flowId: string) {
  dialog.openTextDialog({
    data: {
      title: t('views.automations.delete'),
      contentText: t('views.automations.delete_confirm'),
      confirmText: t('views.automations.delete'),
      loading: isDeleting,
    },
    onConfirm: async () => {
      await removeFlow({ id: flowId });
    },
  });
}
</script>
