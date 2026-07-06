<template>
  <nav
    ref="sidebarRef"
    class="recordings-sidebar fixed transition-all duration-200 overflow-x-hidden overflow-y-auto md:!pl-0 pl-safe pb-safe flex flex-col z-4"
    :style="{
      width: `${sidebarWidth}px`,
      borderRightWidth: isOpen ? '1px' : '0px',
      paddingBottom: `calc(env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px) + ${bottombarHeight}px + ${topbarHeight}px)`,
    }"
  >
    <div class="flex flex-col gap-4 p-4" :style="{ width: `${SIDEBAR_WIDTH}px` }">
      <div class="flex flex-col gap-2">
        <label class="sidebar-section-title">{{ $t('views.recordings.search') }}</label>
        <span class="p-input-icon-left w-full">
          <InputText
            :model-value="filters.search"
            :placeholder="$t('views.recordings.search_placeholder')"
            class="w-full text-sm"
            @update:model-value="updateSearchDebounced($event as string)"
          />
        </span>
      </div>

      <div class="sidebar-divider" />
      <div class="flex flex-col gap-2">
        <label class="sidebar-section-title flex items-center gap-1.5">
          <i-tabler:sparkles class="w-3.5 h-3.5" />
          {{ $t('views.recordings.semantic_search') }}
        </label>
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
      </div>

      <div class="sidebar-divider" />

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

      <template v-if="selectedCameraName">
        <div class="sidebar-divider" />
        <div class="flex flex-col gap-2">
          <label class="sidebar-section-title">{{ $t('views.recordings.grid_search') }}</label>
          <div class="relative rounded-md overflow-hidden">
            <CuiCameraSnapshot :camera="selectedCameraName" object-fit="cover" />
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

      <div class="sidebar-divider" />

      <div class="flex flex-col gap-2">
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
    </div>
  </nav>
</template>

<script setup lang="ts">
import { EVENT_TYPE_OTHER } from '@camera.ui/nvr';
import { BASE_AUDIO_LABELS, DETECTION_ATTRIBUTES, DETECTION_LABELS, EVENT_TRIGGER_TYPES } from '@camera.ui/sdk';
import IconChevronDown from '~icons/tabler/chevron-down';
import IconChevronUp from '~icons/tabler/chevron-up';

import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { RecordingsFilterSidebarEmits, RecordingsFilterSidebarProps, RecordingsFilterState } from './types.js';

const SIDEBAR_WIDTH = 288;

const AUDIO_LABEL_I18N: Record<string, string> = {
  doorbell: 'views.recordings.audio_doorbell',
  glass_break: 'views.recordings.audio_glass_break',
  siren: 'views.recordings.audio_siren',
  speaking: 'views.recordings.audio_speaking',
  gunshot: 'views.recordings.audio_gunshot',
  dog_bark: 'views.recordings.audio_dog_bark',
  baby_cry: 'views.recordings.audio_baby_cry',
  alarm: 'views.recordings.audio_alarm',
  scream: 'views.recordings.audio_scream',
  cat: 'views.recordings.audio_cat',
  car_alarm: 'views.recordings.audio_car_alarm',
  smoke_alarm: 'views.recordings.audio_smoke_alarm',
};

const ATTRIBUTE_I18N: Record<string, string> = {
  face: 'views.recordings.attr_face',
  license_plate: 'views.recordings.attr_license_plate',
};

const SENSOR_EVENT_LABELS: Record<string, string> = {
  motion: 'views.recordings.sensor_motion',
  audio: 'views.recordings.sensor_audio',
  contact: 'views.recordings.sensor_contact',
  doorbell: 'views.recordings.sensor_doorbell',
  switch: 'views.recordings.sensor_switch',
  light: 'views.recordings.sensor_light',
  siren: 'views.recordings.sensor_siren',
  security_system: 'views.recordings.sensor_security_system',
  'line-crossing': 'views.recordings.sensor_line_crossing',
};

const NON_FILTER_LABELS = new Set(['motion', 'audio']);

const props = defineProps<RecordingsFilterSidebarProps>();

const emit = defineEmits<RecordingsFilterSidebarEmits>();

const { t } = useI18n();
const { xlBreakpoint } = useSharedCuiBreakpoint();
const { topbarHeight, bottombarHeight } = useSharedCuiStates();

const { icons: DETECTION_ICONS, generic: GENERIC_ICON } = resolveEventIcons();
// Sensor event icons are already included in DETECTION_ICONS from resolveEventIcons()
const sensorEventIcons = DETECTION_ICONS;

const chevronUp = IconChevronUp;
const chevronDown = IconChevronDown;

const sidebarRef = useTemplateRef('sidebarRef');

// Local semantic search input — only emits on submit (Enter / button click)
const semanticInput = ref(props.filters.semanticQuery ?? '');

const sections = reactive({
  eventTypes: true,
  attributes: true,
  sensorEvents: true,
});

const sidebarWidth = computed(() => (props.isOpen ? SIDEBAR_WIDTH : 0));

const cameraOptions = computed(() => props.cameras.map((c) => ({ id: c.id, name: c.name })));

const selectedCameraName = computed<string | undefined>(() => {
  if (props.filters.cameraIds.length !== 1) return undefined;
  const cam = props.cameras.find((c) => c.id === props.filters.cameraIds[0]);
  return cam?.name;
});

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
    label: t(SENSOR_EVENT_LABELS[value] ?? `views.recordings.sensor_${value}`),
    value: value as string,
    icon: sensorEventIcons[value] ?? GENERIC_ICON,
  })),
);

const audioLabelOptions = computed(() =>
  BASE_AUDIO_LABELS.map((label) => ({
    label: t(AUDIO_LABEL_I18N[label] ?? label),
    value: label,
    icon: DETECTION_ICONS[label] ?? GENERIC_ICON,
  })),
);

const attributeOptions = computed(() =>
  DETECTION_ATTRIBUTES.map((attr) => ({
    label: t(ATTRIBUTE_I18N[attr] ?? `views.recordings.attr_${attr}`),
    value: attr as string,
    icon: DETECTION_ICONS[attr] ?? GENERIC_ICON,
  })),
);

function updateFilter<K extends keyof RecordingsFilterState>(key: K, value: RecordingsFilterState[K] | undefined): void {
  emit('update:filters', { ...props.filters, [key]: value });
}

const updateSearchDebounced = useDebounceFn((value: string) => {
  updateFilter('search', value);
}, 300);

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

function toggleSection(section: keyof typeof sections): void {
  sections[section] = !sections[section];
}

// Auto-clear when user empties the input after a search was submitted
watch(semanticInput, (val) => {
  if (!val?.trim() && props.filters.semanticQuery) {
    updateFilter('semanticQuery', '');
  }
});

onClickOutside(sidebarRef, (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('#recordings-sidebar-toggle')) return;
  if (target.closest('[data-pc-section="overlay"], [data-pc-section="panel"], .p-connected-overlay')) return;
  if (props.isOpen && (props.isOverlay || !xlBreakpoint.value)) {
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

.semantic-textarea {
  resize: vertical;
  min-height: 2.5rem;
}
</style>
