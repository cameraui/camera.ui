<template>
  <nav
    ref="sidebarRef"
    class="recordings-sidebar fixed transition-all duration-200 overflow-x-hidden overflow-y-auto md:!pl-0 pl-safe pb-safe flex flex-col z-4"
    :style="{
      width: `${sidebarWidth}px`,
      borderRightWidth: isOpen ? '1px' : '0px',
      paddingBottom: `calc(var(--safe-area-inset-top) + var(--safe-area-inset-bottom) + ${bottombarHeight}px + ${topbarOffset}px)`,
    }"
  >
    <div class="flex flex-col gap-4 p-4" :style="{ width: `${SIDEBAR_WIDTH}px` }">
      <div class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ $t('views.recordings.content_kind') }}</label>
        <SelectButton
          :model-value="filters.contentKind"
          :options="contentKindOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          class="content-kind-toggle"
          @update:model-value="updateFilter('contentKind', $event)"
        />
        <template v-if="episodesOnly">
          <span class="text-xs text-muted">{{ resultLabel }}</span>
          <span class="text-xs text-muted">{{ $t('views.recordings.content_kind_episodes_hint') }}</span>
        </template>
      </div>

      <div class="sidebar-divider" />

      <div v-if="activeSearchMode" class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ activeSearchMode.label }}</label>
        <SelectButton
          v-if="searchModeOptions.length > 1"
          :model-value="activeSearchMode.value"
          :options="searchModeOptions"
          option-value="value"
          data-key="value"
          :allow-empty="false"
          class="search-mode-toggle"
          @update:model-value="searchMode = $event"
        >
          <template #option="{ option }">
            <component :is="option.icon" v-tooltip.bottom="option.label" :aria-label="option.label" class="w-4 h-4" />
          </template>
        </SelectButton>

        <template v-if="activeSearchMode.value === 'text'">
          <InputText
            :model-value="filters.search"
            :placeholder="$t('views.recordings.search_placeholder')"
            class="w-full text-sm"
            @update:model-value="updateSearchDebounced($event as string)"
          />
          <span class="text-xs text-muted">{{ resultLabel }}</span>
        </template>

        <template v-else-if="activeSearchMode.value === 'semantic'">
          <Textarea
            v-model="semanticInput"
            :placeholder="$t('views.recordings.semantic_search_placeholder')"
            class="w-full text-sm semantic-textarea"
            rows="3"
            :disabled="!semanticSearchAvailable"
          />
          <Button
            :label="$t('views.recordings.semantic_search_button')"
            severity="secondary"
            outlined
            size="small"
            class="w-full text-xs"
            :loading="semanticSearchLoading"
            :disabled="!semanticSearchAvailable || !semanticInput?.trim()"
            @click="submitSemanticSearch"
          />
          <span v-if="semanticCount != null" class="inline-flex items-center gap-1 text-xs text-muted">
            <i-tabler:sparkles class="w-3 h-3" />
            {{ $t('views.recordings.semantic_results', { count: semanticCount }) }}
          </span>
          <div v-if="filters.semanticQuery" class="flex flex-col gap-1.5 mt-1">
            <label class="text-xs text-muted">{{ $t('views.recordings.min_match_score') }}</label>
            <div class="flex items-center gap-3">
              <Slider
                :model-value="filters.minSemanticScore"
                :min="0"
                :max="1"
                :step="0.05"
                class="flex-1"
                @update:model-value="updateFilter('minSemanticScore', $event as number)"
              />
              <span class="text-xs font-mono w-8 text-right shrink-0">{{ Math.round(filters.minSemanticScore * 100) }}%</span>
            </div>
          </div>
        </template>

        <template v-else-if="activeSearchMode.value === 'assistant'">
          <InputText
            v-model="assistantInput"
            :placeholder="$t('views.recordings.assistant_search_placeholder')"
            class="w-full text-sm"
            :disabled="assistantSearchLoading"
            @keydown.enter.prevent="submitAssistantSearch"
          />
          <Button
            :label="$t('views.recordings.assistant_search_button')"
            severity="secondary"
            outlined
            size="small"
            class="w-full text-xs"
            :loading="assistantSearchLoading"
            :disabled="!assistantInput.trim()"
            @click="submitAssistantSearch"
          />
          <span v-if="assistantSearchNote" class="text-xs text-muted">{{ assistantSearchNote }}</span>
        </template>

        <label
          v-else
          class="image-drop"
          :class="{ 'image-drop-over': imageDragOver }"
          @dragover.prevent="imageDragOver = true"
          @dragleave.prevent="imageDragOver = false"
          @drop.prevent="onImageDrop"
        >
          <i-tabler:photo-search class="w-6 h-6" />
          <span class="text-xs text-center">{{ $t('views.recordings.image_search_drop') }}</span>
          <input type="file" accept="image/*" class="hidden" @change="onImageSelect" />
        </label>
      </div>

      <div v-if="activeSearchMode" class="sidebar-divider" />

      <div v-if="roomOptions.length > 1" class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ $t('views.recordings.rooms') }}</label>
        <MultiSelect
          :model-value="filters.rooms"
          :options="roomOptions"
          option-label="name"
          option-value="id"
          :placeholder="$t('views.recordings.all_rooms')"
          class="w-full text-sm"
          :max-selected-labels="2"
          :show-toggle-all="false"
          :pt="{ overlay: { style: 'position: fixed' } }"
          @update:model-value="updateRooms($event)"
        />
      </div>

      <div class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ $t('views.recordings.cameras') }}</label>
        <MultiSelect
          :model-value="filters.cameraIds"
          :options="cameraOptions"
          option-label="name"
          option-value="id"
          :placeholder="$t('views.recordings.all_cameras')"
          class="w-full text-sm"
          :max-selected-labels="2"
          :show-toggle-all="false"
          :pt="{ overlay: { style: 'position: fixed' } }"
          @update:model-value="updateFilter('cameraIds', $event)"
        />
      </div>

      <template v-if="selectedCameraId && !episodesOnly">
        <div class="sidebar-divider" />
        <div class="flex flex-col gap-2">
          <label class="sidebar-section-title">{{ $t('views.recordings.grid_search') }}</label>
          <div class="relative rounded-md overflow-hidden">
            <CuiCameraSnapshot :camera="selectedCameraId" object-fit="cover" />
            <CuiGridSearch :model-value="filters.gridRegions" @update:model-value="updateFilter('gridRegions', $event)" />
          </div>
          <Button
            :label="$t('views.recordings.grid_clear')"
            severity="secondary"
            outlined
            size="small"
            class="w-full text-xs"
            :disabled="filters.gridRegions.length === 0"
            @click="updateFilter('gridRegions', [])"
          />
        </div>
      </template>

      <div v-if="!episodesOnly" class="sidebar-divider" />

      <div v-if="!episodesOnly" class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ $t('views.recordings.confidence') }}</label>
        <div class="flex items-center gap-3">
          <Slider
            :model-value="filters.minConfidence"
            :min="0"
            :max="1"
            :step="0.05"
            class="flex-1"
            @update:model-value="updateFilter('minConfidence', $event as number)"
          />
          <span class="text-xs font-mono w-8 text-right shrink-0">{{ Math.round(filters.minConfidence * 100) }}%</span>
        </div>
      </div>

      <div class="sidebar-divider" />

      <div class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ $t('views.recordings.time_range') }}</label>
        <div class="flex flex-wrap gap-1">
          <Button
            v-for="range in timeRangeOptions"
            :key="range.value"
            :label="range.label"
            :severity="filters.timeRange === range.value ? undefined : 'secondary'"
            :outlined="filters.timeRange !== range.value"
            size="small"
            class="text-xs flex-1 min-w-0"
            @click="updateFilter('timeRange', filters.timeRange === range.value ? null : range.value)"
          />
        </div>
      </div>

      <template v-if="!episodesOnly">
        <div class="sidebar-divider" />

        <div class="flex flex-col gap-2">
          <button class="sidebar-section-title flex items-center justify-between w-full cursor-pointer" @click="toggleSection('sensorEvents')">
            <span>{{ $t('views.recordings.sensor_events') }}</span>
            <component :is="sections.sensorEvents ? chevronUp : chevronDown" class="w-4 h-4 text-muted" />
          </button>
          <div v-if="sections.sensorEvents" class="flex flex-col gap-2">
            <template v-for="sensor in sensorEventOptions" :key="sensor.value">
              <label class="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox :model-value="filters.sensorEvents.includes(sensor.value)" :binary="true" @update:model-value="toggleSensorEvent(sensor.value)" />
                <component :is="sensor.icon" class="w-4 h-4 text-muted" />
                <span>{{ sensor.label }}</span>
              </label>
              <div v-if="sensor.value === 'audio' && filters.sensorEvents.includes('audio')" class="flex flex-col gap-2 ml-6">
                <label v-for="al in audioLabelOptions" :key="al.value" class="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox :model-value="filters.audioLabels.includes(al.value)" :binary="true" @update:model-value="toggleAudioLabel(al.value)" />
                  <component :is="al.icon" class="w-4 h-4 text-muted" />
                  <span>{{ al.label }}</span>
                </label>
              </div>
            </template>
          </div>
        </div>

        <div class="filter-logic-divider">
          <div class="filter-logic-line" />
          <SelectButton
            :model-value="filters.filterLogicTriggers"
            :options="filterLogicOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            class="filter-logic-toggle"
            @update:model-value="updateFilter('filterLogicTriggers', $event)"
          />
          <div class="filter-logic-line" />
        </div>

        <div class="flex flex-col gap-2">
          <button class="sidebar-section-title flex items-center justify-between w-full cursor-pointer" @click="toggleSection('eventTypes')">
            <span>{{ $t('views.recordings.event_type') }}</span>
            <component :is="sections.eventTypes ? chevronUp : chevronDown" class="w-4 h-4 text-muted" />
          </button>
          <div v-if="sections.eventTypes" class="flex flex-col gap-2">
            <label v-for="type in eventTypeOptions" :key="type.value" class="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox :model-value="filters.eventTypes.includes(type.value)" :binary="true" @update:model-value="toggleEventType(type.value)" />
              <component :is="type.icon" class="w-4 h-4 text-muted" />
              <span>{{ type.label }}</span>
            </label>
          </div>
        </div>

        <div class="filter-logic-divider">
          <div class="filter-logic-line" />
          <SelectButton
            :model-value="filters.filterLogicAttributes"
            :options="filterLogicOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            class="filter-logic-toggle"
            @update:model-value="updateFilter('filterLogicAttributes', $event)"
          />
          <div class="filter-logic-line" />
        </div>

        <div class="flex flex-col gap-2">
          <button class="sidebar-section-title flex items-center justify-between w-full cursor-pointer" @click="toggleSection('attributes')">
            <span>{{ $t('views.recordings.attributes') }}</span>
            <component :is="sections.attributes ? chevronUp : chevronDown" class="w-4 h-4 text-muted" />
          </button>
          <div v-if="sections.attributes" class="flex flex-col gap-2">
            <label v-for="attr in attributeOptions" :key="attr.value" class="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox :model-value="filters.hasAttributes.includes(attr.value)" :binary="true" @update:model-value="toggleAttribute(attr.value)" />
              <component :is="attr.icon" class="w-4 h-4 text-muted" />
              <span>{{ attr.label }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox :model-value="filters.eventTypes.includes(otherOption.value)" :binary="true" @update:model-value="toggleEventType(otherOption.value)" />
              <component :is="otherOption.icon" class="w-4 h-4 text-muted" />
              <span>{{ otherOption.label }}</span>
            </label>
          </div>
        </div>

        <div class="sidebar-divider" />

        <div class="flex flex-col gap-2">
          <button class="sidebar-section-title flex items-center justify-between w-full cursor-pointer" @click="toggleSection('vehicles')">
            <span>{{ $t('views.recordings.vehicles') }}</span>
            <component :is="sections.vehicles ? chevronUp : chevronDown" class="w-4 h-4 text-muted" />
          </button>
          <div v-if="sections.vehicles" class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              <button
                v-for="color in vehicleColorOptions"
                :key="color.value"
                v-tooltip.top="{ value: color.label }"
                class="vehicle-color"
                :class="{ 'vehicle-color-active': filters.vehicleColors.includes(color.value) }"
                :style="{ background: color.swatch }"
                :aria-label="color.label"
                :aria-pressed="filters.vehicleColors.includes(color.value)"
                @click="toggleVehicleFilter('vehicleColors', color.value)"
              />
            </div>
            <div class="flex flex-wrap gap-1">
              <Button
                v-for="type in vehicleTypeOptions"
                :key="type.value"
                :label="type.label"
                :severity="filters.vehicleTypes.includes(type.value) ? undefined : 'secondary'"
                :outlined="!filters.vehicleTypes.includes(type.value)"
                size="small"
                class="text-xs"
                @click="toggleVehicleFilter('vehicleTypes', type.value)"
              />
            </div>
            <span class="text-xs text-muted">{{ $t('views.recordings.vehicle_filter_hint') }}</span>
          </div>
        </div>
      </template>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { EVENT_TYPE_OTHER, VEHICLE_COLORS, VEHICLE_TYPES } from '@camera.ui/nvr';
import { BASE_AUDIO_LABELS, DETECTION_ATTRIBUTES, DETECTION_LABELS, EVENT_TRIGGER_TYPES } from '@camera.ui/sdk';
import RobotIcon from '~icons/mdi/robot-outline';
import IconChevronDown from '~icons/tabler/chevron-down';
import IconChevronUp from '~icons/tabler/chevron-up';
import PhotoSearchIcon from '~icons/tabler/photo-search';
import SearchIcon from '~icons/tabler/search';
import SparklesIcon from '~icons/tabler/sparkles';

import { attributeLabelKey, audioLabelKey, sensorLabelKey, vehicleColorKey, vehicleTypeKey } from '@/common/eventLabels.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { Component } from 'vue';
import type { RecordingsFilterSidebarEmits, RecordingsFilterSidebarProps, RecordingsFilterState, RecordingsSearchMode } from './types.js';

const SIDEBAR_WIDTH = 288;

const NON_FILTER_LABELS = new Set(['motion', 'audio']);

const VEHICLE_SWATCHES: Record<string, string> = {
  white: '#f5f5f5',
  gray: '#9ca3af',
  yellow: '#facc15',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  black: '#111827',
};

const props = defineProps<RecordingsFilterSidebarProps>();

const emit = defineEmits<RecordingsFilterSidebarEmits>();

const { t } = useI18n();
const { topbarOffset, bottombarHeight } = useSharedCuiStates();
const { icons: DETECTION_ICONS, generic: GENERIC_ICON } = resolveEventIcons();

const sensorEventIcons = DETECTION_ICONS;
const chevronUp = IconChevronUp;
const chevronDown = IconChevronDown;

const sidebarRef = useTemplateRef('sidebarRef');
const semanticInput = ref(props.filters.semanticQuery ?? '');
const assistantInput = ref('');
const searchMode = ref<RecordingsSearchMode>(props.filters.semanticQuery ? 'semantic' : 'text');
const imageDragOver = ref(false);

const sections = reactive({
  eventTypes: true,
  attributes: true,
  sensorEvents: true,
  vehicles: true,
});

const sidebarWidth = computed(() => (props.isOpen ? SIDEBAR_WIDTH : 0));

const roomOptions = computed(() => {
  const names = [...new Set(props.cameras.map((c) => c.room).filter((room): room is string => !!room))];
  names.sort((a, b) => a.localeCompare(b));
  return names.map((room) => ({ id: room, name: room === 'Default' ? t('components.form.label.room_default') : room }));
});

const cameraOptions = computed(() => {
  const rooms = props.filters.rooms;
  const cameras = rooms.length > 0 ? props.cameras.filter((c) => rooms.includes(c.room ?? '')) : props.cameras;
  return cameras.map((c) => ({ id: c.id, name: c.name }));
});

const selectedCameraId = computed<string | undefined>(() => {
  if (props.filters.cameraIds.length !== 1) return undefined;
  return props.cameras.find((c) => c.id === props.filters.cameraIds[0])?.id;
});

const episodesOnly = computed(() => props.filters.contentKind === 'episodes');

const resultLabel = computed(() => {
  const unit = episodesOnly.value ? 'episodes' : 'recordings';
  if (props.resultTotal === undefined) return t(`views.recordings.result_count_${unit}`, { count: props.resultCount });
  const total = props.resultCapped ? `${props.resultTotal}+` : props.resultTotal;
  return t(`views.recordings.result_count_${unit}_of`, { count: props.resultCount, total });
});

const searchModeOptions = computed(() => {
  const options: { value: RecordingsSearchMode; label: string; icon: Component }[] = [];
  if (!episodesOnly.value) {
    options.push({ value: 'text', label: t('views.recordings.search'), icon: SearchIcon });
    options.push({ value: 'semantic', label: t('views.recordings.semantic_search'), icon: SparklesIcon });
  }
  if (props.assistantSearchAvailable) options.push({ value: 'assistant', label: t('views.recordings.assistant_search'), icon: RobotIcon });
  if (props.imageSearchAvailable && !episodesOnly.value) options.push({ value: 'image', label: t('views.recordings.image_search'), icon: PhotoSearchIcon });
  return options;
});

const activeSearchMode = computed(() => searchModeOptions.value.find((option) => option.value === searchMode.value) ?? searchModeOptions.value[0]);

const contentKindOptions = computed(() => [
  { label: t('views.recordings.content_kind_all'), value: 'all' as const },
  { label: t('views.recordings.content_kind_events'), value: 'events' as const },
  { label: t('views.recordings.content_kind_episodes'), value: 'episodes' as const },
]);

const filterLogicOptions = computed(() => [
  { label: t('views.recordings.filter_and'), value: 'and' as const },
  { label: t('views.recordings.filter_or'), value: 'or' as const },
]);

const timeRangeOptions = computed(() => [
  { label: t('views.recordings.time_1h'), value: '1h' as const },
  { label: t('views.recordings.time_1d'), value: '1d' as const },
  { label: t('views.recordings.time_1w'), value: '1w' as const },
  { label: t('views.recordings.time_1m'), value: '1m' as const },
]);

const eventTypeOptions = computed(() =>
  DETECTION_LABELS.filter((l) => !NON_FILTER_LABELS.has(l)).map((type) => ({
    label: t(`views.recordings.type_${type}`),
    value: type as string,
    icon: DETECTION_ICONS[type] ?? GENERIC_ICON,
  })),
);

const otherOption = computed(() => ({
  label: t('views.recordings.type_other'),
  value: EVENT_TYPE_OTHER,
  icon: DETECTION_ICONS['other'] ?? GENERIC_ICON,
}));

const sensorEventOptions = computed(() =>
  EVENT_TRIGGER_TYPES.map((value) => ({
    label: t(sensorLabelKey(value)),
    value: value as string,
    icon: sensorEventIcons[value] ?? GENERIC_ICON,
  })),
);

const audioLabelOptions = computed(() =>
  BASE_AUDIO_LABELS.map((label) => ({
    label: t(audioLabelKey(label)),
    value: label,
    icon: DETECTION_ICONS[label] ?? GENERIC_ICON,
  })),
);

const attributeOptions = computed(() =>
  DETECTION_ATTRIBUTES.map((attr) => ({
    label: t(attributeLabelKey(attr)),
    value: attr as string,
    icon: DETECTION_ICONS[attr] ?? GENERIC_ICON,
  })),
);

const vehicleColorOptions = computed(() =>
  VEHICLE_COLORS.map((color) => ({ label: t(vehicleColorKey(color)), value: color as string, swatch: VEHICLE_SWATCHES[color] })),
);

const vehicleTypeOptions = computed(() => VEHICLE_TYPES.map((type) => ({ label: t(vehicleTypeKey(type)), value: type as string })));

function updateFilter<K extends keyof RecordingsFilterState>(key: K, value: RecordingsFilterState[K] | undefined): void {
  emit('update:filters', { ...props.filters, [key]: value });
}

const updateSearchDebounced = useDebounceFn((value: string) => {
  updateFilter('search', value);
}, 300);

function updateRooms(rooms: string[]): void {
  const within = new Set(props.cameras.filter((c) => rooms.length === 0 || rooms.includes(c.room ?? '')).map((c) => c.id));
  emit('update:filters', { ...props.filters, rooms, cameraIds: props.filters.cameraIds.filter((id) => within.has(id)) });
}

function submitAssistantSearch(): void {
  const text = assistantInput.value.trim();
  if (!text || props.assistantSearchLoading) return;
  emit('assistant-search', text);
}

function onImageDrop(event: DragEvent): void {
  imageDragOver.value = false;
  searchImage(event.dataTransfer?.files);
}

function onImageSelect(event: Event): void {
  const input = event.target as HTMLInputElement;
  searchImage(input.files);
  input.value = '';
}

function searchImage(files: FileList | null | undefined): void {
  const image = Array.from(files ?? []).find((file) => file.type.startsWith('image/'));
  if (image) emit('image-search', image);
}

function submitSemanticSearch(): void {
  const query = semanticInput.value.trim();
  updateFilter('semanticQuery', query);
  emit('semantic-search', query);
}

function toggleEventType(type: string): void {
  const current = [...props.filters.eventTypes];
  const idx = current.indexOf(type);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(type);
  }
  updateFilter('eventTypes', current);
}

function toggleAudioLabel(label: string): void {
  const current = [...props.filters.audioLabels];
  const idx = current.indexOf(label);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(label);
  }
  updateFilter('audioLabels', current);
}

function toggleSensorEvent(type: string): void {
  const current = [...props.filters.sensorEvents];
  const idx = current.indexOf(type);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(type);
  }
  updateFilter('sensorEvents', current);
}

function toggleAttribute(attr: string): void {
  const current = [...props.filters.hasAttributes];
  const idx = current.indexOf(attr);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(attr);
  }
  updateFilter('hasAttributes', current);
}

function toggleVehicleFilter(key: 'vehicleColors' | 'vehicleTypes', value: string): void {
  const current = props.filters[key];
  updateFilter(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
}

function toggleSection(section: keyof typeof sections): void {
  sections[section] = !sections[section];
}

watch(semanticInput, (val) => {
  if (!val?.trim() && props.filters.semanticQuery) {
    updateFilter('semanticQuery', '');
  }
});

onClickOutside(sidebarRef, (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('#recordings-sidebar-toggle')) return;
  if (target.closest('[data-pc-section="overlay"], [data-pc-section="panel"], .p-connected-overlay')) return;
  if (props.isOpen && props.isOverlay) {
    emit('close');
  }
});

defineExpose({
  sidebarWidth,
});
</script>

<style scoped>
.recordings-sidebar {
  background: var(--subnavbar-background);
  border-right-style: solid;
  border-right-color: var(--border-color);
  height: 100%;
}

.sidebar-section-title {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted-color);
  letter-spacing: 0.05em;
  background: none;
  border: none;
  padding: 0;
}

.sidebar-divider {
  border-top: 1px solid var(--border-color);
}

.filter-logic-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-logic-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

:deep(.filter-logic-toggle) {
  flex-shrink: 0;

  .p-togglebutton {
    padding: 0.15rem 0.5rem;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    min-width: 0;
  }
}

:deep(.content-kind-toggle) {
  display: flex;

  .p-togglebutton {
    flex: 1;
    min-width: 0;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
  }
}

.vehicle-color {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: box-shadow 150ms ease;
}

.vehicle-color-active {
  box-shadow:
    0 0 0 2px var(--subnavbar-background),
    0 0 0 4px var(--p-primary-color);
}

.semantic-textarea {
  resize: vertical;
  min-height: 2.5rem;
}

:deep(.search-mode-toggle) {
  display: flex;

  .p-togglebutton {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.5rem;
  }
}

.image-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.75rem;
  border: 1px dashed var(--border-color);
  border-radius: 0.75rem;
  color: var(--p-text-muted-color);
  cursor: pointer;
  transition:
    border-color 150ms ease,
    color 150ms ease;
}

.image-drop:hover,
.image-drop-over {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}
</style>
