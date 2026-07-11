<template>
  <div ref="container" class="w-full h-full relative min-w-0">
    <div class="flex flex-col justify-center items-center">
      <div class="relative w-full">
        <div ref="outsideRef"></div>

        <div
          class="w-full flex justify-center gap-3"
          :class="{
            'flex-row items-stretch': containerSize.width.value > 740,
            'flex-col': containerSize.width.value <= 740,
          }"
        >
          <div class="relative w-full flex flex-col items-center justify-center">
            <div class="absolute top-0 left-0 right-0 bottom-0">
              <div ref="playgroundContainerRef" class="playground-container flex w-full h-full min-w-0">
                <section class="playground w-full h-full" :class="playgroundClasses" @click="addHandle">
                  <div class="sandbox w-full h-full">
                    <div class="handles">
                      <div
                        v-for="coord in coords"
                        v-show="activeTab === 'zones'"
                        :key="coord._id"
                        ref="draggablesRef"
                        class="handle"
                        :data-id="coord._id"
                        :data-point="`${coord.zoneIndex}-${coord.pointIndex}`"
                        :data-point-index="coord.pointIndex"
                        :data-zone-index="coord.zoneIndex"
                        @dblclick.prevent="removeHandler(coord)"
                      >
                        <div class="delete-point"></div>
                      </div>

                      <div class="clipboard">
                        <svg width="100%" height="100%" class="polygon-container">
                          <template v-if="activeTab === 'zones'">
                            <path
                              v-for="(zone, i) in detectionZones"
                              :key="`zone-${i}`"
                              :d="convertToSvgPath(zone.points)"
                              class="cursor-pointer"
                              :class="{
                                dash: zone.type === 'intersect' && !zone.isPrivacyMask,
                                selected: selectedZone === i,
                              }"
                              :style="{
                                fill: zone.isPrivacyMask ? 'rgba(16, 16, 16, 0.9)' : zone.filter === 'exclude' ? 'transparent' : `${zone.color}4D`,
                                stroke: zone.isPrivacyMask ? '#333333' : zone.color,
                                'stroke-width': '2',
                              }"
                              @click="selectZone(i)"
                              @dblclick="() => (zone.isPrivacyMask = !zone.isPrivacyMask)"
                              @mousedown="startDragPolygon($event, i)"
                              @mousemove="onDragPolygon"
                              @mouseup="endDragPolygon"
                              @touchstart="startDragPolygon($event, i)"
                              @touchmove="onDragPolygon"
                              @touchend="endDragPolygon"
                            />
                          </template>

                          <template v-if="activeTab === 'lines'">
                            <defs>
                              <marker
                                v-for="(line, i) in detectionLines"
                                :id="`editor-arrow-ab-${i}`"
                                :key="`marker-ab-${i}`"
                                markerWidth="6"
                                markerHeight="5"
                                refX="5"
                                refY="2.5"
                                orient="auto"
                                markerUnits="strokeWidth"
                              >
                                <path d="M0,0 L6,2.5 L0,5 Z" :fill="line.color" />
                              </marker>
                              <marker
                                v-for="(line, i) in detectionLines"
                                :id="`editor-arrow-ba-${i}`"
                                :key="`marker-ba-${i}`"
                                markerWidth="6"
                                markerHeight="5"
                                refX="1"
                                refY="2.5"
                                orient="auto"
                                markerUnits="strokeWidth"
                              >
                                <path d="M6,0 L0,2.5 L6,5 Z" :fill="line.color" />
                              </marker>
                            </defs>
                            <template v-for="(line, i) in detectionLines" :key="`line-${i}`">
                              <line
                                :x1="lineSvgEditor(line).h1x"
                                :y1="lineSvgEditor(line).h1y"
                                :x2="lineSvgEditor(line).h2x"
                                :y2="lineSvgEditor(line).h2y"
                                :stroke="line.color"
                                stroke-width="2"
                                stroke-dasharray="6,4"
                                opacity="0.6"
                              />
                              <line
                                :x1="lineSvgEditor(line).ax"
                                :y1="lineSvgEditor(line).ay"
                                :x2="lineSvgEditor(line).bx"
                                :y2="lineSvgEditor(line).by"
                                :stroke="line.color"
                                stroke-width="3"
                                class="cursor-pointer"
                                :stroke-opacity="selectedLine === i ? 1 : 0.7"
                                :marker-end="line.direction !== 'b-to-a' ? `url(#editor-arrow-ab-${i})` : undefined"
                                :marker-start="line.direction !== 'a-to-b' ? `url(#editor-arrow-ba-${i})` : undefined"
                                @click="selectedLine = i"
                              />
                              <rect :x="lineSvgEditor(line).labelAx - 9" :y="lineSvgEditor(line).labelAy - 9" width="18" height="18" rx="4" :fill="line.color" />
                              <text
                                :x="lineSvgEditor(line).labelAx"
                                :y="lineSvgEditor(line).labelAy"
                                fill="#fff"
                                font-size="11"
                                font-weight="bold"
                                text-anchor="middle"
                                dominant-baseline="central"
                              >
                                A
                              </text>
                              <rect :x="lineSvgEditor(line).labelBx - 9" :y="lineSvgEditor(line).labelBy - 9" width="18" height="18" rx="4" :fill="line.color" />
                              <text
                                :x="lineSvgEditor(line).labelBx"
                                :y="lineSvgEditor(line).labelBy"
                                fill="#fff"
                                font-size="11"
                                font-weight="bold"
                                text-anchor="middle"
                                dominant-baseline="central"
                              >
                                B
                              </text>
                              <circle
                                :cx="lineSvgEditor(line).h1x"
                                :cy="lineSvgEditor(line).h1y"
                                r="8"
                                :fill="line.color"
                                :stroke="selectedLine === i ? '#fff' : line.color"
                                stroke-width="2"
                                class="cursor-grab"
                                @mousedown.stop="startDragLineHandle($event, i, 0)"
                                @touchstart.stop="startDragLineHandle($event, i, 0)"
                              />
                              <circle
                                :cx="lineSvgEditor(line).h2x"
                                :cy="lineSvgEditor(line).h2y"
                                r="8"
                                :fill="line.color"
                                :stroke="selectedLine === i ? '#fff' : line.color"
                                stroke-width="2"
                                class="cursor-grab"
                                @mousedown.stop="startDragLineHandle($event, i, 1)"
                                @touchstart.stop="startDragLineHandle($event, i, 1)"
                              />
                            </template>
                          </template>
                        </svg>
                      </div>
                    </div>

                    <div class="shadowboard on"></div>
                  </div>
                </section>
              </div>
            </div>

            <div class="w-full h-full flex flex-col items-center justify-center min-w-0" style="width: calc(100% - 20px); margin-top: 10px; margin-bottom: 10px">
              <CuiCameraCard
                ref="cameraCardRef"
                :camera-info="cameraName"
                source-role="low-resolution"
                streaming-mode="webrtc"
                :toolbar="false"
                :control="false"
                :subcontrol="false"
                flat-card
                class="w-full h-full border-[1px] border-color-inner"
                card-background-color="#000"
              />
            </div>
          </div>

          <div
            class="w-full flex flex-col gap-6 zone-buttons items-center self-stretch"
            :class="{
              '!gap-3': containerSize.width.value > 740,
            }"
            :style="{
              'max-width': containerSize.width.value > 740 ? '300px' : undefined,
            }"
          >
            <SelectButton
              v-model="activeTab"
              :options="tabOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :pt="{
                root: { class: 'flex w-full' },
                pcToggleButton: { root: { class: 'flex-1 !text-sm' } },
              }"
            />

            <template v-if="activeTab === 'lines'">
              <div class="flex flex-col field-gap w-full">
                <label :for="`line[${selectedLine}].name`" class="cui-label">{{ $t('components.form.label.name') }}</label>
                <InputGroup>
                  <InputText
                    :model-value="detectionLines[selectedLine]?.name"
                    :invalid="!!selectedLineNameError"
                    :loading="isLoading"
                    :disabled="selectedLine < 0"
                    type="text"
                    @value-change="
                      (e) => {
                        if (detectionLines[selectedLine]) detectionLines[selectedLine].name = e ?? '';
                      }
                    "
                  />
                </InputGroup>

                <Transition name="fade">
                  <span v-if="selectedLineNameError" class="cui-input-error">{{ selectedLineNameError }}</span>
                </Transition>
              </div>

              <div class="flex flex-col field-gap w-full">
                <label :for="`line[${selectedLine}].labels`" class="cui-label">{{ $t('components.form.label.labels') }}</label>
                <InputGroup>
                  <MultiSelect
                    :model-value="detectionLines[selectedLine]?.labels"
                    :options="lineLabelOptions"
                    :loading="isLoading"
                    :max-selected-labels="2"
                    :show-toggle-all="false"
                    option-label="label"
                    option-value="value"
                    option-group-label="label"
                    option-group-children="items"
                    show-clear
                    type="text"
                    @value-change="
                      (e) => {
                        if (detectionLines[selectedLine]) detectionLines[selectedLine].labels = e;
                      }
                    "
                  />
                </InputGroup>
              </div>

              <div class="flex flex-col field-gap w-full">
                <label :for="`line[${selectedLine}].color`" class="cui-label">{{ $t('components.form.label.color') }}</label>
                <InputGroup>
                  <InputText :model-value="detectionLines[selectedLine]?.color" :loading="isLoading" readonly type="text" />
                  <InputGroupAddon>
                    <ColorPicker
                      :key="selectedLine"
                      :model-value="detectionLines[selectedLine]?.color"
                      format="hex"
                      @value-change="(e) => (e && detectionLines[selectedLine] ? (detectionLines[selectedLine].color = `#${e}`) : null)"
                    />
                  </InputGroupAddon>
                </InputGroup>
              </div>

              <div class="flex flex-row h-[50px] rounded-full overflow-hidden justify-self-center max-w-max border-[1px] border-color-inner mt-auto">
                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.new') }"
                  :loading="isLoading"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="addLine"
                >
                  <template #icon>
                    <i-mdi:plus width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.delete') }"
                  :loading="isLoading"
                  :disabled="!detectionLines.length || selectedLine < 0"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="removeLine"
                >
                  <template #icon>
                    <i-mdi:delete width="20px" height="20px" />
                  </template>
                </Button>
              </div>

              <div class="flex flex-row h-[50px] rounded-full overflow-hidden justify-self-center max-w-max border-[1px] border-color-inner">
                <Button
                  v-tooltip.top="{
                    value: detectionLines[selectedLine]?.direction === 'both' ? 'A ↔ B' : detectionLines[selectedLine]?.direction === 'a-to-b' ? 'A → B' : 'B → A',
                  }"
                  :loading="isLoading"
                  :disabled="selectedLine < 0"
                  severity="secondary"
                  class="!rounded-none !h-full w-[80px] text-sm"
                  @click="cycleLineDirection"
                >
                  {{ detectionLines[selectedLine]?.direction === 'both' ? 'A ↔ B' : detectionLines[selectedLine]?.direction === 'a-to-b' ? 'A → B' : 'B → A' }}
                </Button>
              </div>
            </template>

            <template v-if="activeTab === 'zones'">
              <div class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].name`" class="cui-label">{{ $t('components.form.label.name') }}</label>
                <InputGroup>
                  <InputText
                    :model-value="detectionZones[selectedZone]?.name"
                    :invalid="!!selectedZoneNameError"
                    :loading="isLoading"
                    :disabled="selectedZone < 0 || detectionZones[selectedZone]?.isPrivacyMask"
                    type="text"
                    @value-change="
                      (e) => {
                        if (detectionZones[selectedZone]) detectionZones[selectedZone].name = e ?? '';
                      }
                    "
                  />
                </InputGroup>

                <Transition name="fade">
                  <span v-if="selectedZoneNameError" class="cui-input-error">{{ selectedZoneNameError }}</span>
                </Transition>
              </div>

              <div class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].labels`" class="cui-label">{{ $t('components.form.label.labels') }}</label>
                <InputGroup>
                  <MultiSelect
                    :model-value="detectionZones[selectedZone]?.labels"
                    :options="labelOptions"
                    :disabled="detectionZones[selectedZone]?.isPrivacyMask"
                    :loading="isLoading"
                    :max-selected-labels="2"
                    :show-toggle-all="false"
                    option-label="label"
                    option-value="value"
                    option-group-label="label"
                    option-group-children="items"
                    show-clear
                    type="text"
                    @value-change="(e) => (detectionZones[selectedZone].labels = e)"
                  />
                </InputGroup>
              </div>

              <div class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].color`" class="cui-label">{{ $t('components.form.label.color') }}</label>
                <InputGroup>
                  <InputText
                    :model-value="detectionZones[selectedZone]?.color"
                    :disabled="detectionZones[selectedZone]?.isPrivacyMask"
                    :loading="isLoading"
                    readonly
                    type="text"
                  />

                  <InputGroupAddon>
                    <ColorPicker
                      :key="selectedZone"
                      :model-value="detectionZones[selectedZone]?.color"
                      format="hex"
                      :disabled="detectionZones[selectedZone]?.isPrivacyMask"
                      @value-change="(e) => (e ? (detectionZones[selectedZone].color = `#${e}`) : null)"
                    />
                  </InputGroupAddon>
                </InputGroup>
              </div>

              <div class="flex flex-row h-[50px] rounded-full overflow-hidden justify-self-center max-w-max border-[1px] border-color-inner mt-auto">
                <Button
                  v-if="!customizing"
                  v-tooltip.top="{ value: $t('components.form.tooltip.new') }"
                  :loading="isLoading"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="startCustomizing"
                >
                  <template #icon>
                    <i-mdi:plus width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-else
                  v-tooltip.top="{ value: $t('components.form.tooltip.finish') }"
                  :disabled="Boolean(currentZone !== undefined && detectionZones[currentZone]?.points?.length < 3)"
                  :loading="isLoading"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="finishCustomizing(false)"
                >
                  <template #icon>
                    <i-mdi:check width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.edit') }"
                  :loading="isLoading"
                  :disabled="!detectionZones.length || selectedZone < 0 || customizing"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="editZone"
                >
                  <template #icon>
                    <i-mdi:pencil width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.delete') }"
                  :loading="isLoading"
                  :disabled="!detectionZones.length || selectedZone < 0"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="removeZone"
                >
                  <template #icon>
                    <i-mdi:delete width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.undo') }"
                  :loading="isLoading"
                  :disabled="!detectionZones.length"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="undo"
                >
                  <template #icon>
                    <i-mdi:undo width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.clear') }"
                  :loading="isLoading"
                  :disabled="!detectionZones.length"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="clear"
                >
                  <template #icon>
                    <i-mdi:cancel width="20px" height="20px" />
                  </template>
                </Button>
              </div>

              <div class="flex flex-row h-[50px] rounded-full overflow-hidden justify-self-center max-w-max border-[1px] border-color-inner">
                <Button
                  v-tooltip.top="{
                    value: detectionZones[selectedZone]?.isPrivacyMask ? $t('components.form.tooltip.privacy_mask') : $t('components.form.tooltip.public_mask'),
                  }"
                  :loading="isLoading"
                  :disabled="!(detectionZones.length && selectedZone >= 0 && detectionZones[selectedZone])"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="changePrivacy"
                >
                  <template #icon>
                    <i-mdi:cctv-off v-if="detectionZones[selectedZone]?.isPrivacyMask" width="20px" height="20px" />
                    <i-mdi:cctv v-else width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{
                    value: detectionZones[selectedZone]?.filter === 'include' ? $t('components.form.tooltip.include') : $t('components.form.tooltip.exclude'),
                  }"
                  :loading="isLoading"
                  :disabled="detectionZones[selectedZone]?.isPrivacyMask"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="changeFilter"
                >
                  <template #icon>
                    <i-mdi:rectangle v-if="detectionZones[selectedZone]?.filter === 'include'" width="20px" height="20px" />
                    <i-mdi:rectangle-outline v-else width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{
                    value: detectionZones[selectedZone]?.type === 'intersect' ? $t('components.form.tooltip.intersect') : $t('components.form.tooltip.contain'),
                  }"
                  :loading="isLoading"
                  :disabled="detectionZones[selectedZone]?.isPrivacyMask"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="changeType"
                >
                  <template #icon>
                    <i-mdi:vector-intersection v-if="detectionZones[selectedZone]?.type === 'intersect'" width="20px" height="20px" />
                    <i-mdi:checkbox-intermediate v-else width="20px" height="20px" />
                  </template>
                </Button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DETECTION_LABELS } from '@camera.ui/sdk';
import Draggabilly from 'draggabilly';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { deepToRaw } from '@/common/utils.js';
import { cameraCreatePatchLines, cameraCreatePatchZones } from '@/schemas/cameras.schema.js';
import { NON_SPATIAL_LABELS, NON_TRACKED_LABELS } from './types.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { DetectionLine, DetectionZone, LineDirection } from '@camera.ui/sdk';
import type { CoordsPosition, LabelGroup, ZoneEditorProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<ZoneEditorProps>();

const toast = useCuiToast();
const { t } = useI18n();

const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: patchCameraZones, isPending: patchCameraZonesLoading } = camerasQuery.patchZonesQuery();
const { mutateAsync: patchCameraLines, isPending: patchCameraLinesLoading } = camerasQuery.patchLinesQuery();

const { cameraName, zones } = toRefs(props);
const cameraCardRef = useTemplateRef('cameraCardRef');
const containerRef = useTemplateRef('container');
const draggablesRef = useTemplateRef<HTMLElement[]>('draggablesRef');
const outsideRef = useTemplateRef('outsideRef');
const playgroundContainerRef = useTemplateRef<HTMLElement>('playgroundContainerRef');
const activeTab = ref<'zones' | 'lines'>(props.initialTab ?? 'zones');
const draggies = shallowRef<Draggabilly[]>([]);
const detectionZones = ref<DetectionZone[]>([]);
const detectionLines = ref<DetectionLine[]>([]);
const customizing = ref(false);
const coords = ref<CoordsPosition[]>([]);
const currentZone = ref<number | undefined>(undefined);
const selectedZone = ref(-1);
const selectedAction = ref(-1);
const selectedLine = ref(-1);

if (props.initialSelection !== undefined) {
  if ((props.initialTab ?? 'zones') === 'zones') {
    selectedZone.value = props.initialSelection;
  } else {
    selectedLine.value = props.initialSelection;
  }
}
const dragStart = { x: 0, y: 0 };

let isDragging = false;
let draggingLine: { lineIndex: number; pointIndex: number } | null = null;

const containerSize = useElementSize(containerRef);
const playgroundSize = useElementSize(playgroundContainerRef);

const zoneNameSchema = cameraCreatePatchZones.element.shape.name;
const lineNameSchema = cameraCreatePatchLines.element.shape.name;

const selectedZoneNameError = computed(() => {
  if (selectedZone.value < 0) return '';
  const zone = detectionZones.value[selectedZone.value];
  if (!zone || zone.isPrivacyMask) return '';
  const result = zoneNameSchema.safeParse(zone.name);
  return result.success ? '' : (result.error.issues[0]?.message ?? '');
});

const selectedLineNameError = computed(() => {
  if (selectedLine.value < 0) return '';
  const line = detectionLines.value[selectedLine.value];
  if (!line) return '';
  const result = lineNameSchema.safeParse(line.name);
  return result.success ? '' : (result.error.issues[0]?.message ?? '');
});

// The actual interactive area is the playground minus 10px padding on each side.
// Coordinate math must use these dimensions (not playgroundSize which includes padding).
const contentWidth = computed(() => Math.max(0, playgroundSize.width.value - 20));
const contentHeight = computed(() => Math.max(0, playgroundSize.height.value - 20));

const tabOptions = computed(() => [
  { label: t('components.zone_editor.tab_zones'), value: 'zones' as const },
  { label: t('components.zone_editor.tab_lines'), value: 'lines' as const },
]);

const labelOptions = computed<LabelGroup[]>(() => {
  const filteredLabels = DETECTION_LABELS.filter((label) => !NON_SPATIAL_LABELS.includes(label));

  if (filteredLabels.length === 0) return [];

  return [
    {
      label: t('components.zone_editor.base_labels'),
      items: filteredLabels.map((label) => ({ label, value: label })),
    },
  ];
});

const lineLabelOptions = computed<LabelGroup[]>(() => {
  const filteredLabels = DETECTION_LABELS.filter((label) => !NON_TRACKED_LABELS.includes(label));

  if (filteredLabels.length === 0) return [];

  return [
    {
      label: t('components.zone_editor.base_labels'),
      items: filteredLabels.map((label) => ({ label, value: label })),
    },
  ];
});

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || patchCameraZonesLoading.value || patchCameraLinesLoading.value));

const playgroundClasses = computed(() => {
  const classes: string[] = [];

  if (customizing.value) {
    classes.push('customizing');
  }

  if (!detectionZones.value?.length) {
    classes.push('start');
  }

  return classes.join(' ');
});

function updateCoordinatesFromZones() {
  if (!detectionZones.value) return;

  if (detectionZones.value.length === 0) {
    coords.value = [];
    return;
  }

  coords.value = detectionZones.value.flatMap((zone, zoneIndex) => {
    return zone.points.map((point, pointIndex) => {
      return {
        // Index-based id keeps draggies stable when the user renames a zone.
        _id: `z${zoneIndex}-p${pointIndex}`,
        zoneIndex,
        pointIndex,
        point: [point[0], point[1]],
      };
    });
  });
}

function getEventPosition(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in e) {
    const touch = e.touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }

  return { x: e.clientX, y: e.clientY };
}

function startDragPolygon(e: MouseEvent | TouchEvent, zoneIndex: number) {
  e.stopPropagation();

  if (!playgroundContainerRef.value) {
    return;
  }

  finishCustomizing(customizing.value);

  isDragging = true;
  selectedZone.value = zoneIndex;

  const rect = playgroundContainerRef.value.getBoundingClientRect();
  const { x, y } = getEventPosition(e);
  const cw = contentWidth.value;
  const ch = contentHeight.value;

  // Subtract 10px padding to get position relative to content area
  dragStart.x = ((x - rect.left - 10) / cw) * 100;
  dragStart.y = ((y - rect.top - 10) / ch) * 100;
}

function onDragPolygon(e: MouseEvent | TouchEvent): void {
  if (!isDragging || !playgroundContainerRef.value || selectedZone.value === -1 || !detectionZones.value.length) {
    return;
  }

  const rect = playgroundContainerRef.value.getBoundingClientRect();
  const { x, y } = getEventPosition(e);
  const cw = contentWidth.value;
  const ch = contentHeight.value;

  const currentX = ((x - rect.left - 10) / cw) * 100;
  const currentY = ((y - rect.top - 10) / ch) * 100;

  const offsetX = currentX - dragStart.x;
  const offsetY = currentY - dragStart.y;

  const points = detectionZones.value[selectedZone.value].points;
  let boundaryHit = false;

  for (let i = 0; i < points.length; i++) {
    const newX = points[i][0] + offsetX;
    const newY = points[i][1] + offsetY;

    if (newX < 0 || newX > 100 || newY < 0 || newY > 100) {
      boundaryHit = true;
      break;
    }
  }

  if (!boundaryHit) {
    for (let i = 0; i < points.length; i++) {
      points[i][0] += offsetX;
      points[i][1] += offsetY;

      points[i][0] = Math.max(0, Math.min(100, points[i][0]));
      points[i][1] = Math.max(0, Math.min(100, points[i][1]));

      const draggieX = (points[i][0] / 100) * cw;
      const draggieY = (points[i][1] / 100) * ch;

      const draggie = draggies.value.find((d) => d.id === `z${selectedZone.value}-p${i}`);
      draggie?.setPosition(draggieX, draggieY);
    }
  }

  dragStart.x = currentX;
  dragStart.y = currentY;
}

function endDragPolygon(): void {
  setTimeout(() => {
    isDragging = false;
  }, 100);
}

function changePrivacy(): void {
  if (!detectionZones.value.length || selectedZone.value === -1) {
    return;
  }

  detectionZones.value[selectedZone.value].isPrivacyMask = !detectionZones.value[selectedZone.value].isPrivacyMask;
}

function changeFilter(): void {
  if (!detectionZones.value[selectedZone.value]) {
    return;
  }

  detectionZones.value[selectedZone.value].filter = detectionZones.value[selectedZone.value].filter === 'include' ? 'exclude' : 'include';
}

function changeType(): void {
  if (!detectionZones.value[selectedZone.value]) {
    return;
  }

  detectionZones.value[selectedZone.value].type = detectionZones.value[selectedZone.value].type === 'intersect' ? 'contain' : 'intersect';
}

function addHandle(e: MouseEvent): void {
  if (!customizing.value || isDragging) {
    return;
  }

  const zoneIndex = currentZone.value !== undefined ? currentZone.value : detectionZones.value.length;
  const x = Math.min(Math.max(Math.round(((e.offsetX - 10) / contentWidth.value) * 100), 0), 100);
  const y = Math.min(Math.max(Math.round(((e.offsetY - 10) / contentHeight.value) * 100), 0), 100);

  if (currentZone.value === undefined) {
    // Create a new zone
    const newZoneName = `zone-${Date.now()}`;
    detectionZones.value.push({
      name: newZoneName,
      points: [],
      filter: 'include',
      type: 'contain',
      labels: ['motion', 'person', 'vehicle', 'animal'],
      isPrivacyMask: false,
      color: getRandomHexColor(),
    });

    currentZone.value = detectionZones.value.length - 1;
  }

  // Add new point to the current zone
  detectionZones.value[zoneIndex].points.push([x, y]);

  // Refresh coords to ensure draggies are correctly displayed
  updateCoordinatesFromZones();

  nextTick(() => {
    const pointIndex = detectionZones.value[zoneIndex].points.length - 1;
    handleAdded({
      _id: `z${zoneIndex}-p${pointIndex}`,
      zoneIndex,
      pointIndex,
      point: [x, y],
    });
  });
}

function handleAdded(payload: CoordsPosition): void {
  if (payload.zoneIndex === undefined || payload.pointIndex === undefined) {
    return;
  }

  const draggable = draggablesRef.value?.filter((el) => el.dataset.pointIndex === payload.pointIndex.toString() && el.dataset.zoneIndex === payload.zoneIndex.toString());

  if (!draggable || draggable.length === 0) {
    return;
  }

  styleHandle(draggable[0], payload.point);
}

function updateHandle(payload: CoordsPosition): void {
  if (!detectionZones.value.length) {
    return;
  }

  const x = Math.round((payload.point[0] / contentWidth.value) * 100);
  const y = Math.round((payload.point[1] / contentHeight.value) * 100);

  detectionZones.value[payload.zoneIndex].points[payload.pointIndex] = [x, y];
}

function startCustomizing(): void {
  customizing.value = true;
  currentZone.value = undefined;
}

function finishCustomizing(inEdit: boolean): void {
  if (currentZone.value === undefined) {
    customizing.value = false;
    return;
  }

  customizing.value = inEdit || false;
  const zoneIndex = currentZone.value;

  if (!detectionZones.value[zoneIndex] || !detectionZones.value[zoneIndex].points) {
    return;
  }

  if (detectionZones.value[zoneIndex].points.length < 3) {
    detectionZones.value.splice(zoneIndex, 1);
    updateCoordinatesFromZones();
  } else {
    draggablesRef.value?.forEach((el) => makeDraggable(el));
    selectedZone.value = zoneIndex;
  }

  currentZone.value = undefined;
}

function editZone(): void {
  customizing.value = true;
  currentZone.value = selectedZone.value;
}

function removeZone(): void {
  if (selectedZone.value === -1 || !detectionZones.value.length) {
    return;
  }

  detectionZones.value.splice(selectedZone.value, 1);
  selectedZone.value = Math.max(-1, selectedZone.value - 1);

  updateCoordinatesFromZones();
  nextTick(() => {
    resetHandles();
  });
}

function undo(): void {
  if (!detectionZones.value?.length) {
    return;
  }

  if (customizing.value && currentZone.value !== undefined) {
    const zone = detectionZones.value[currentZone.value];
    if (zone.points.length) {
      zone.points.pop();

      if (zone.points.length === 0) {
        detectionZones.value.splice(currentZone.value, 1);
        currentZone.value = undefined;
      }

      updateCoordinatesFromZones();
    }
    return;
  }

  if (detectionZones.value.length > 0) {
    detectionZones.value.pop();

    updateCoordinatesFromZones();
    nextTick(() => {
      resetHandles();
    });
  }
}

function clear(): void {
  isDragging = false;
  customizing.value = false;
  currentZone.value = undefined;

  if (detectionZones.value) {
    detectionZones.value.length = 0;
    coords.value = [];
    nextTick(() => {
      clearDraggies();
    });
  }
}

function getRandomHexColor(): string {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function convertToSvgPath(points: [number, number][]): string {
  if (!points || !points.length) {
    return '';
  }

  const svgPoints = points.map((point) => {
    const x = Math.round((point[0] / 100) * contentWidth.value);
    const y = Math.round((point[1] / 100) * contentHeight.value);
    return `${x + 10},${y + 10}`;
  });

  if (svgPoints.length === 0) {
    return '';
  }

  let path = `M ${svgPoints[0]}`;
  for (let i = 1; i < svgPoints.length; i++) {
    path += ` L ${svgPoints[i]}`;
  }
  path += ' Z';

  return path;
}

function selectZone(index: number): void {
  if (customizing.value) {
    return;
  }

  selectedZone.value = index;
}

function resetHandles(): void {
  clearDraggies();

  draggablesRef.value?.forEach((el: HTMLElement) => {
    if (!el.dataset.zoneIndex || !el.dataset.pointIndex) {
      return;
    }

    const zoneIndex = parseInt(el.dataset.zoneIndex);
    const pointIndex = parseInt(el.dataset.pointIndex);

    if (!detectionZones.value[zoneIndex] || !detectionZones.value[zoneIndex].points[pointIndex]) {
      return;
    }

    const point = detectionZones.value[zoneIndex].points[pointIndex];

    if (point) {
      styleHandle(el, point);
      makeDraggable(el);
    }
  });
}

function clearDraggies(): void {
  draggies.value.forEach((draggie) => draggie.destroy());
  draggies.value = [];
}

function removeHandler(coord: CoordsPosition): void {
  if (!detectionZones.value.length || !detectionZones.value[coord.zoneIndex] || detectionZones.value[coord.zoneIndex].points.length < 4) {
    return;
  }

  detectionZones.value[coord.zoneIndex].points.splice(coord.pointIndex, 1);

  updateCoordinatesFromZones();
  nextTick(() => {
    resetHandles();
  });
}

function styleHandle(el: HTMLElement, point: [number, number]): void {
  Object.assign(el.style, placeHandle(point));
}

function placeHandle(point: [number, number]): { left: string; top: string } {
  return {
    left: Math.round((point[0] / 100) * contentWidth.value) + 'px',
    top: Math.round((point[1] / 100) * contentHeight.value) + 'px',
  };
}

function makeDraggable(el: HTMLElement): void {
  el.classList.add('draggable');

  const draggie = new Draggabilly(el, {
    containment: true,
    grid: [0, 0],
  })
    .on('pointerDown', () => {
      document.querySelectorAll(`[data-point="${el.dataset.zoneIndex}-${el.dataset.pointIndex}"]`)[0]?.classList.add('changing');
    })
    .on('dragMove', () => {
      if (!el.dataset.zoneIndex || !el.dataset.pointIndex || !el.dataset.id) {
        return;
      }

      const x = draggie.position.x;
      const y = draggie.position.y;

      updateHandle({
        _id: el.dataset.id,
        point: [x, y],
        pointIndex: parseInt(el.dataset.pointIndex),
        zoneIndex: parseInt(el.dataset.zoneIndex),
      });
    })
    .on('pointerUp', () => {
      document.querySelectorAll('.point').forEach((point) => point.classList.remove('changing'));
    });

  draggie.id = el.dataset.id!;

  draggies.value.push(draggie);
}

function startDragLineHandle(e: MouseEvent | TouchEvent, lineIndex: number, pointIndex: number) {
  e.preventDefault();
  selectedLine.value = lineIndex;
  draggingLine = { lineIndex, pointIndex };

  const onMove = (ev: MouseEvent | TouchEvent) => {
    if (!draggingLine || !playgroundContainerRef.value) return;
    const rect = playgroundContainerRef.value.getBoundingClientRect();
    const { x, y } = getEventPosition(ev);
    const px = Math.min(Math.max(((x - rect.left - 10) / contentWidth.value) * 100, 0), 100);
    const py = Math.min(Math.max(((y - rect.top - 10) / contentHeight.value) * 100, 0), 100);
    detectionLines.value[draggingLine.lineIndex].points[draggingLine.pointIndex] = [Math.round(px), Math.round(py)];
  };

  const onUp = () => {
    draggingLine = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove);
  document.addEventListener('touchend', onUp);
}

function addLine(): void {
  detectionLines.value.push({
    name: `line-${Date.now()}`,
    points: [
      [40, 30],
      [60, 70],
    ],
    direction: 'both' as LineDirection,
    labels: ['person', 'vehicle', 'animal', 'package'],
    color: getRandomHexColor(),
  });
  selectedLine.value = detectionLines.value.length - 1;
}

function removeLine(): void {
  if (selectedLine.value < 0 || !detectionLines.value.length) return;
  detectionLines.value.splice(selectedLine.value, 1);
  selectedLine.value = Math.max(-1, selectedLine.value - 1);
}

function cycleLineDirection(): void {
  if (selectedLine.value < 0) return;
  const line = detectionLines.value[selectedLine.value];
  if (!line) return;
  const order: LineDirection[] = ['both', 'a-to-b', 'b-to-a'];
  const idx = order.indexOf(line.direction);
  line.direction = order[(idx + 1) % order.length];
}

function lineSvgEditor(line: DetectionLine) {
  const cw = contentWidth.value;
  const ch = contentHeight.value;
  const pad = 10;

  // Convert handle points to pixel space first
  const h1px = (line.points[0][0] / 100) * cw + pad;
  const h1py = (line.points[0][1] / 100) * ch + pad;
  const h2px = (line.points[1][0] / 100) * cw + pad;
  const h2py = (line.points[1][1] / 100) * ch + pad;

  // Midpoint in pixel space
  const mx = (h1px + h2px) / 2;
  const my = (h1py + h2py) / 2;

  // Handle vector in pixel space
  const hdx = h2px - h1px;
  const hdy = h2py - h1py;
  const hLen = Math.sqrt(hdx * hdx + hdy * hdy) || 1;

  // Perpendicular in pixel space (90° rotation) — same length as handle segment
  const perpX = -hdy;
  const perpY = hdx;

  // Crossing line endpoints
  const rawAx = mx - perpX / 2;
  const rawAy = my - perpY / 2;
  const rawBx = mx + perpX / 2;
  const rawBy = my + perpY / 2;

  // Unit vector along crossing line (A→B) in pixel space
  const ux = perpX / hLen;
  const uy = perpY / hLen;

  // Visible area bounds
  const minX = pad;
  const maxX = pad + cw;
  const minY = pad;
  const maxY = pad + ch;
  const labelHalf = 9; // half of 18px rect
  const gap = 6; // gap between arrow tip and label

  // 1. Clamp labels first (they define the outermost positions)
  const clamp = (x: number, y: number) => ({
    x: Math.max(minX + labelHalf, Math.min(maxX - labelHalf, x)),
    y: Math.max(minY + labelHalf, Math.min(maxY - labelHalf, y)),
  });
  const outset = labelHalf + gap + 6; // label half + gap + arrow marker size
  const labelA = clamp(rawAx - ux * outset, rawAy - uy * outset);
  const labelB = clamp(rawBx + ux * outset, rawBy + uy * outset);

  // 2. Derive crossing line endpoints from labels (inward by gap + label half)
  const lineInset = labelHalf + gap;
  const ax = labelA.x + ux * lineInset;
  const ay = labelA.y + uy * lineInset;
  const bx = labelB.x - ux * lineInset;
  const by = labelB.y - uy * lineInset;

  return {
    h1x: h1px,
    h1y: h1py,
    h2x: h2px,
    h2y: h2py,
    ax,
    ay,
    bx,
    by,
    labelAx: labelA.x,
    labelAy: labelA.y,
    labelBx: labelB.x,
    labelBy: labelB.y,
  };
}

async function onConfirm(): Promise<void | null> {
  try {
    const promises: Promise<any>[] = [];

    promises.push(
      patchCameraZones({
        cameraname: cameraName.value,
        zoneData: detectionZones.value,
      }),
    );

    promises.push(
      patchCameraLines({
        cameraname: cameraName.value,
        lineData: detectionLines.value,
      }),
    );

    await Promise.all(promises);
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
    return null;
  }
}

onClickOutside(outsideRef, (evt) => {
  const target = evt.target as HTMLElement;
  const isPolygon = target.closest('.polygon');
  const editButton = target.closest('.edit-button');
  const removeButton = target.closest('.remove-button');
  const handle = target.closest('.handle');
  const zoneButtons = target.closest('.zone-buttons');
  const selectList = target.closest('.p-multiselect-list');
  const colorPicker = target.closest('.p-colorpicker-panel');

  if (!isPolygon && !editButton && !removeButton && !handle && !customizing.value && !zoneButtons && !selectList && !colorPicker) {
    selectedZone.value = -1;
  }
});

watch(selectedAction, () => {
  selectedAction.value = -1;
});

watch(selectedZone, (newZone, oldZone) => {
  if (newZone === -1 && detectionZones.value?.length && detectionZones.value[oldZone]) {
    selectedZone.value = oldZone;
    return;
  }

  if (newZone === -1 && detectionZones.value?.length) {
    selectedAction.value = 0;
  }
});

watch(
  zones,
  () => {
    detectionZones.value = deepToRaw(zones.value);
    updateCoordinatesFromZones();
  },
  { deep: true, immediate: true },
);

watch(
  () => props.lines,
  () => {
    detectionLines.value = deepToRaw(props.lines);
  },
  { deep: true, immediate: true },
);

watch(
  activeTab,
  (tab) => {
    if (tab === 'zones') {
      if (detectionZones.value.length && (selectedZone.value < 0 || selectedZone.value >= detectionZones.value.length)) {
        selectedZone.value = 0;
      }
    } else if (detectionLines.value.length && (selectedLine.value < 0 || selectedLine.value >= detectionLines.value.length)) {
      selectedLine.value = 0;
    }
  },
  { immediate: true },
);

watch([playgroundSize.width, playgroundSize.height], () => {
  resetHandles();
});

onMounted(async () => {
  setTimeout(() => {
    resetHandles();
  });
});

defineExpose({
  isLoading,
  onConfirm,
});
</script>

<style lang="scss" scoped>
.playground-container {
  justify-content: center;
  flex: 1;
  position: relative;
  z-index: 100;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  @media (min-width: 800px) {
    border-radius: 0 0 2px 2px;
  }

  .playground {
    position: relative;

    &:hover {
      .handle {
        opacity: 1;
      }
    }

    &.customizing {
      cursor: crosshair;
    }

    &.start {
      .custom-notice {
        opacity: 1;
      }
    }

    .custom-notice {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 1rem;
      pointer-events: none;
      opacity: 0;
      transition: background 0.25s;
      background: rgba(255, 255, 255, 0);

      div {
        width: 100%;
        text-align: center;
        background: rgba(255, 255, 255, 0.9);
        padding: 1rem;
        margin: 0 2rem;
        transition: opacity 0.25s;
        border-radius: 2px;
        box-shadow: 0 1px 2px rgba(16, 10, 9, 0.15);
        opacity: 1;

        .touchy {
          &:after {
            content: 'Click';
          }
        }
      }
    }

    .sandbox {
      position: relative;
      touch-action: none;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;

      .shadowboard {
        position: absolute;
        z-index: 11;
        top: 10px;
        left: 10px;
        right: 10px;
        bottom: 10px;
        background: rgba(223, 42, 76, 0.3) center center;
        background-size: cover;
      }

      .shadowboard {
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.375s;

        &.on {
          opacity: 0;
        }
      }
    }
  }

  .playground.customizing .handle {
    pointer-events: none;
  }
}

.handles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;

  .clipboard {
    position: absolute;
    top: 0px;
    left: 0px;
    right: 0px;
    bottom: 0px;
    z-index: 1;

    .polygon-container {
      position: absolute;

      path {
        &.selected {
          stroke-width: 2;
        }

        &.dash {
          stroke-dasharray: 5, 5;
        }
      }
    }
  }

  .delete-point,
  .handle {
    position: absolute;
    width: 20px;
    height: 20px;
    z-index: 2;
  }

  .handle {
    border-radius: 50%;
    box-shadow: #fff inset 0 0 0 10px;
    opacity: 0.8;
    transition: opacity 0.25s;

    &.is-dragging,
    &.is-pointer-down {
      z-index: 100;
      box-shadow: #d0d0d0 inset 0 0 0 10px;
      cursor: none;
      transition: box-shadow 0s;
    }

    &.draggable {
      cursor: grab;
    }

    &.show-delete {
      .delete-point {
        transform: scale3d(0.9, 0.9, 0.9);
        transition:
          transform 0.25s cubic-bezier(0.15, 1, 0.3, 1.1),
          opacity 0.25s;
        opacity: 1;
      }
    }

    &:after {
      display: block;
      content: '';
      position: absolute;
      top: -8px;
      left: -8px;
      right: -8px;
      bottom: -8px;
    }

    .delete-point {
      position: absolute;
      left: 22px;
      top: 0;
      width: 25px;
      padding-left: 5px;
      border-radius: 3px;
      background: #d3d0c9;
      transform: scale3d(0, 0, 0);
      transform-origin: left center;
      cursor: pointer;
      opacity: 0.75;
      clip-path: polygon(25% 0, 100% 1%, 100% 100%, 25% 100%, 0 50%);
      transition:
        transform 0.25s,
        opacity 0.25s;

      &:after {
        display: block;
        content: '';
        position: absolute;
        top: 4px;
        left: 9px;
        right: 4px;
        bottom: 4px;
        background: #100a09;
        clip-path: polygon(20% 10%, 10% 20%, 40% 50%, 10% 80%, 20% 90%, 50% 60%, 80% 90%, 90% 80%, 60% 50%, 90% 20%, 80% 10%, 50% 40%);
      }
    }
  }
}
</style>
