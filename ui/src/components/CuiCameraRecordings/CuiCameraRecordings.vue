<template>
  <div class="flex flex-col h-full">
    <div class="recordings-toolbar flex flex-col gap-1 py-1.5">
      <template v-if="mobileSearchActive">
        <div class="flex items-center gap-1">
          <Button text rounded severity="secondary" class="shrink-0 cui-icon-md" @click="closeMobileSearch">
            <template #icon>
              <i-tabler:arrow-left width="100%" height="100%" />
            </template>
          </Button>
          <IconField class="flex-1 min-w-0">
            <InputIcon>
              <i-tabler:search class="w-3.5 h-3.5" />
            </InputIcon>
            <InputText ref="mobileSearchInputRef" v-model="search" :placeholder="$t('views.recordings.search_placeholder')" class="w-full !text-xs !py-1.5" />
          </IconField>
        </div>
      </template>

      <template v-else>
        <div v-if="compact" class="flex items-center gap-1">
          <IconField class="flex-1 min-w-0">
            <InputIcon>
              <i-tabler:search class="w-3.5 h-3.5" />
            </InputIcon>
            <InputText v-model="search" :placeholder="$t('views.recordings.search_placeholder')" class="w-full !text-xs !py-1.5" />
          </IconField>

          <Button
            v-if="gridSearch"
            v-tooltip.top="{ value: $t('views.recordings.grid_search') }"
            text
            rounded
            class="cui-icon-md shrink-0"
            :severity="gridSearch.active.value ? 'primary' : 'secondary'"
            @click="toggleGridSearch"
          >
            <template #icon>
              <i-tabler:grid-scan width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.top="{ value: selectedDate ? formatSelectedDate : $t('views.recordings.date') }"
            text
            rounded
            class="cui-icon-md shrink-0"
            :severity="selectedDate ? 'primary' : 'secondary'"
            @click="(e: MouseEvent) => datePopoverRef?.toggle(e)"
          >
            <template #icon>
              <i-tabler:calendar width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.top="{ value: $t('views.recordings.confidence') }"
            text
            rounded
            class="cui-icon-md shrink-0"
            :severity="minConfidence > 0 ? 'primary' : 'secondary'"
            @click="(e: MouseEvent) => confidencePopoverRef?.toggle(e)"
          >
            <template #icon>
              <i-tabler:percentage width="100%" height="100%" />
            </template>
          </Button>
        </div>

        <div v-if="!compact" class="flex items-center gap-1">
          <SelectButton
            v-model="selectedTypes"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            multiple
            :pt="{
              root: { class: 'flex gap-0.5' },
              pcToggleButton: { root: { class: '!px-2 !py-1.5 !text-xs' } },
            }"
          >
            <template #option="{ option }">
              <div v-tooltip.top="option.label" class="flex items-center">
                <component :is="option.icon" class="w-3.5 h-3.5" />
              </div>
            </template>
          </SelectButton>

          <Divider class="ml-auto" layout="vertical" />

          <div class="flex items-center gap-1 shrink-0">
            <Button
              v-if="gridSearch"
              v-tooltip.top="{ value: $t('views.recordings.grid_search') }"
              text
              rounded
              class="cui-icon-md"
              :severity="gridSearch.active.value ? 'primary' : 'secondary'"
              @click="toggleGridSearch"
            >
              <template #icon>
                <i-tabler:grid-scan width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-tooltip.top="{ value: selectedDate ? formatSelectedDate : $t('views.recordings.date') }"
              text
              rounded
              class="cui-icon-md"
              :severity="selectedDate ? 'primary' : 'secondary'"
              @click="(e: MouseEvent) => datePopoverRef?.toggle(e)"
            >
              <template #icon>
                <i-tabler:calendar width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-tooltip.top="{ value: $t('views.recordings.confidence') }"
              text
              rounded
              class="cui-icon-md"
              :severity="minConfidence > 0 ? 'primary' : 'secondary'"
              @click="(e: MouseEvent) => confidencePopoverRef?.toggle(e)"
            >
              <template #icon>
                <i-tabler:percentage width="100%" height="100%" />
              </template>
            </Button>

            <IconField class="hidden xl:flex">
              <InputIcon>
                <i-tabler:search class="w-3.5 h-3.5" />
              </InputIcon>
              <InputText v-model="search" :placeholder="$t('views.recordings.search_placeholder')" class="!text-xs !py-1.5 !w-36" />
            </IconField>
            <Button v-tooltip.top="{ value: $t('views.recordings.search') }" text rounded severity="secondary" class="xl:hidden cui-icon-md" @click="openMobileSearch">
              <template #icon>
                <i-tabler:search width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </div>

        <SelectButton
          v-if="compact"
          v-model="selectedTypes"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          fluid
          multiple
          :pt="{
            root: { class: 'flex gap-0.5 flex-wrap' },
            pcToggleButton: { root: { class: '!px-2 !py-1.5 !text-xs' } },
          }"
        >
          <template #option="{ option }">
            <div v-tooltip.top="option.label" class="flex items-center">
              <component :is="option.icon" class="w-3.5 h-3.5" />
            </div>
          </template>
        </SelectButton>
      </template>
    </div>

    <Popover ref="datePopoverRef" class="border-none" :pt="{ content: { class: 'p-0' } }">
      <div class="max-w-[305px]">
        <DatePicker
          v-model="selectedDate"
          :max-date="new Date()"
          inline
          :clear-button-props="{ class: 'hidden' }"
          class="hover:text-primary active:text-primary focus:text-primary text-muted-color"
          :pt="{
            pcInputText: {
              root: {
                class: 'text-sm !text-color',
              },
            },
            inputIconContainer: {
              class: 'transition-all text-current',
            },
          }"
        />
        <Button
          v-if="selectedDate"
          :label="$t('views.recordings.grid_clear')"
          severity="secondary"
          outlined
          size="small"
          class="text-xs mt-2"
          fluid
          @click="selectedDate = undefined"
        />
      </div>
    </Popover>

    <Popover ref="confidencePopoverRef" :pt="{ content: { class: 'p-3' } }">
      <div class="w-48 flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted">{{ $t('views.recordings.confidence') }}</span>
          <span class="font-mono">{{ Math.round(minConfidence * 100) }}%</span>
        </div>
        <Slider v-model="minConfidence" :min="0" :max="1" :step="0.05" class="w-full" />
        <Button
          v-if="minConfidence > 0"
          :label="$t('views.recordings.grid_clear')"
          severity="secondary"
          outlined
          size="small"
          class="text-xs"
          fluid
          @click="minConfidence = 0"
        />
      </div>
    </Popover>

    <div class="flex-1 min-h-0 flex flex-col mt-3">
      <CuiRecordingsGrid
        v-if="displayEvents.length"
        :items="displayEvents"
        :min-item-width="150"
        :gap="8"
        :has-more="hasMore"
        :load-more="loadMore"
        :item-key="(e: DetectionEvent) => e.id"
        class="flex-1 min-h-0"
      >
        <template #item="{ item }">
          <RecordingCard
            :event="item"
            :camera-name="cameraName"
            :camera="camera"
            :load-thumbnails="loadThumbnails"
            @scroll-to-event="(ts: number) => emit('scrollToEvent', ts)"
          />
        </template>
      </CuiRecordingsGrid>

      <div v-if="isLoading" class="flex justify-center py-4">
        <i-svg-spinners:ring-resize width="24px" height="24px" class="text-muted" />
      </div>

      <div v-if="!displayEvents.length && !isLoading" class="flex flex-col items-center justify-center py-10 gap-3">
        <i-tabler:video-off class="w-12 h-12 text-muted opacity-30" />
        <p class="text-muted text-sm">{{ $t('views.recordings.no_recordings') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EVENT_TYPE_OTHER, EventHoverPreviewKey, getBestScore, useDetectionEvents, useEventHoverPreview } from '@camera.ui/nvr';
import { DETECTION_ATTRIBUTES, DETECTION_LABELS } from '@camera.ui/sdk';

import { GridSearchKey } from '@/components/CuiGridSearch/types.js';
import CuiRecordingsGrid from '@/components/CuiRecordings/CuiRecordingsGrid.vue';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { GridRegion } from '@/components/CuiGridSearch/types.js';
import type { GetEventsOptions } from '@camera.ui/nvr';
import type { BoundingBox, DetectionEvent } from '@camera.ui/sdk';
import type { CuiCameraRecordingsEmits, CuiCameraRecordingsProps } from './types.js';

const props = withDefaults(defineProps<CuiCameraRecordingsProps>(), { compact: false });

const emit = defineEmits<CuiCameraRecordingsEmits>();

const { t } = useI18n();
const { isTouch } = useSharedCuiUserAgent();

const gridSearch = inject(GridSearchKey, undefined);

if (!isTouch.value && typeof VideoDecoder !== 'undefined') {
  const hoverPreview = useEventHoverPreview({ cacheSize: 10 });
  provide(EventHoverPreviewKey, hoverPreview);
  tryOnScopeDispose(() => hoverPreview.dispose());
}

const GRID_COLS = 10;
const GRID_ROWS = 11;

const { icons: DETECTION_ICONS, generic: GENERIC_ICON } = resolveEventIcons();

const NON_FILTER_LABELS = new Set(['motion', 'audio']);
const ATTR_SET = new Set<string>(DETECTION_ATTRIBUTES);

const typeOptions: { label: string; value: string; icon: Component }[] = [
  ...DETECTION_LABELS.filter((l) => !NON_FILTER_LABELS.has(l)).map((l) => ({
    label: t(`views.recordings.type_${l}`),
    value: l as string,
    icon: DETECTION_ICONS[l] ?? GENERIC_ICON,
  })),
  ...DETECTION_ATTRIBUTES.map((a) => ({
    label: t(`views.recordings.attr_${a}`),
    value: a as string,
    icon: DETECTION_ICONS[a] ?? GENERIC_ICON,
  })),
  {
    label: t('views.recordings.type_other'),
    value: EVENT_TYPE_OTHER,
    icon: DETECTION_ICONS['other'] ?? GENERIC_ICON,
  },
];

const mobileSearchActive = ref(false);
const mobileSearchInputRef = useTemplateRef<{ $el: HTMLElement }>('mobileSearchInputRef');
const search = ref('');
const selectedTypes = ref<string[]>([]);
const selectedTriggers = ref<string[]>([]);
const selectedDate = ref<Date | undefined>();
const minConfidence = ref(0);
const datePopoverRef = useTemplateRef<{ toggle: (e: Event) => void; hide: () => void; show: (e: Event) => void }>('datePopoverRef');
const confidencePopoverRef = useTemplateRef<{ toggle: (e: Event) => void }>('confidencePopoverRef');

const cameraIds = computed(() => [props.cameraId]);

const serverFilter = computed<GetEventsOptions>(() => {
  const attrFilters = selectedTypes.value.filter((t) => ATTR_SET.has(t));
  const hasAnyFilter = selectedTypes.value.length > 0 || selectedTriggers.value.length > 0;
  return {
    types: selectedTypes.value.length > 0 ? selectedTypes.value.filter((t) => !ATTR_SET.has(t)) : undefined,
    triggers: selectedTriggers.value.length > 0 ? selectedTriggers.value : undefined,
    attributes: attrFilters.length > 0 ? attrFilters : undefined,
    search: search.value || undefined,
    state: 'ended',
    hasDetections: !hasAnyFilter,
  };
});

const { events, isLoading, hasMore, loadMore, loadThumbnails } = useDetectionEvents({
  availableCameraIds: cameraIds,
  cameraIds,
  realtime: true,
  pageSize: 30,
  filter: serverFilter,
});

const formatSelectedDate = computed(() => {
  if (!selectedDate.value) return '';
  return selectedDate.value.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
});

// Date + grid regions only — attributes are now server-side.
const displayEvents = computed(() => {
  let result = events.value.filter((e) => e.state === 'ended');

  if (selectedDate.value) {
    const d = selectedDate.value;
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    result = result.filter((e) => e.startTime >= dayStart && e.startTime < dayEnd);
  }

  if (minConfidence.value > 0) {
    result = result.filter((e) => getBestScore(e) >= minConfidence.value);
  }

  const regions = gridSearch?.regions.value;
  if (regions && regions.length > 0) {
    result = result.filter((e) => e.segments.some((s) => s.detections.some((d) => d.box && boxOverlapsRegions(d.box, regions))));
  }

  return result;
});

function boxOverlapsRegions(box: BoundingBox, regions: GridRegion[]): boolean {
  const cellW = 1 / GRID_COLS;
  const cellH = 1 / GRID_ROWS;
  const bCol1 = box.x / cellW;
  const bCol2 = (box.x + box.width) / cellW;
  const bRow1 = box.y / cellH;
  const bRow2 = (box.y + box.height) / cellH;
  for (const r of regions) {
    if (bCol2 > r.col && bCol1 < r.col + r.w && bRow2 > r.row && bRow1 < r.row + r.h) {
      return true;
    }
  }
  return false;
}

function toggleGridSearch() {
  if (!gridSearch) return;
  gridSearch.active.value = !gridSearch.active.value;
  if (!gridSearch.active.value) gridSearch.regions.value = [];
}

function openMobileSearch() {
  mobileSearchActive.value = true;
  nextTick(() => mobileSearchInputRef.value?.$el?.querySelector('input')?.focus());
}

function closeMobileSearch() {
  mobileSearchActive.value = false;
  search.value = '';
}
</script>

<style scoped>
.recordings-toolbar {
  flex-shrink: 0;
}

.recordings-toolbar-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--border-color);
  flex-shrink: 0;
}

:deep(.p-togglebutton-checked .p-togglebutton-content) {
  background: none !important;
  box-shadow: none !important;
}

:deep(.p-togglebutton.p-togglebutton-checked) {
  background: var(--p-primary-color) !important;
  color: var(--p-primary-contrast-color) !important;
  border-color: var(--p-primary-color) !important;
}

:deep(.p-togglebutton.p-togglebutton-checked:hover) {
  background: var(--p-primary-color) !important;
  border-color: var(--p-primary-color) !important;
}
</style>
