<template>
  <div ref="container" class="w-full h-full relative min-w-0">
    <div class="flex flex-col justify-center items-center">
      <div class="relative w-full">
        <div ref="outsideRef"></div>

        <div
          class="w-full flex justify-center gap-3"
          :class="{
            'flex-row items-stretch': containerSize.width.value > 900,
            'flex-col': containerSize.width.value <= 900,
          }"
        >
          <div class="relative w-full flex flex-col items-center justify-center">
            <div class="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center pointer-events-none">
              <div ref="playgroundContainerRef" class="playground-container flex min-w-0 pointer-events-auto" :style="playgroundStyle">
                <section class="playground w-full h-full" :class="playgroundClasses" @click="addHandle">
                  <div class="sandbox w-full h-full">
                    <div class="handles">
                      <div
                        v-for="coord in coords"
                        v-show="activeTab !== 'lines'"
                        :key="coord._id"
                        ref="draggablesRef"
                        class="handle"
                        :data-id="coord._id"
                        :data-point="`${coord.zoneIndex}-${coord.pointIndex}`"
                        :data-point-index="coord.pointIndex"
                        :data-zone-index="coord.zoneIndex"
                        @dblclick.prevent="removeHandler(coord)"
                      >
                        <div class="delete-point" @click.stop="removeHandler(coord)" @pointerdown.stop @mousedown.stop @touchstart.stop></div>
                      </div>

                      <div class="clipboard">
                        <svg width="100%" height="100%" class="polygon-container">
                          <template v-if="activeTab !== 'lines'">
                            <path
                              v-for="(zone, i) in polygons"
                              :key="`poly-${i}`"
                              :d="convertToSvgPath(zone.points)"
                              class="cursor-pointer"
                              :class="{ dash: polygonDashed, selected: selectedZone === i }"
                              :style="polygonStyle(zone)"
                              @click="selectZone(i)"
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
                streaming-mode="auto"
                :toolbar="false"
                :control="false"
                :subcontrol="false"
                :privacy-overlay="false"
                flat-card
                class="w-full h-full border-[1px] border-color-inner"
                card-background-color="#000"
              />
            </div>
          </div>

          <div
            class="w-full flex flex-col gap-6 zone-buttons items-center self-stretch"
            :class="{
              '!gap-3': containerSize.width.value > 900,
            }"
            :style="{
              flex: containerSize.width.value > 900 ? '0 0 440px' : undefined,
              'max-width': containerSize.width.value > 900 ? '440px' : undefined,
            }"
          >
            <SelectButton
              v-model="activeTab"
              :options="tabOptions"
              :allow-empty="false"
              option-label="label"
              option-value="value"
              class="w-full"
              :pt="{
                root: { class: 'flex w-full' },
                pcToggleButton: { root: { class: 'flex-1 !text-xs !px-1 whitespace-nowrap' } },
              }"
            />

            <template v-if="activeTab === 'lines'">
              <p class="cui-input-hint w-full self-stretch text-pretty">{{ $t('components.zone_editor.lines_hint') }}</p>

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
                <label :for="`line[${selectedLine}].labels`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.form.label.labels') }}
                  <span v-tooltip="{ value: $t('components.zone_editor.line_labels_info') }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
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
                <label :for="`line[${selectedLine}].direction`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.zone_editor.line_direction') }}
                  <span v-tooltip="{ value: $t('components.zone_editor.line_direction_info') }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <Select
                    :model-value="detectionLines[selectedLine]?.direction ?? 'both'"
                    :options="lineDirectionOptions"
                    :loading="isLoading"
                    :disabled="selectedLine < 0"
                    option-label="label"
                    option-value="value"
                    @value-change="
                      (e) => {
                        if (detectionLines[selectedLine]) detectionLines[selectedLine].direction = e;
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
                  v-tooltip.top="{ value: $t('components.form.tooltip.delete_line') }"
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
            </template>

            <template v-if="activeTab !== 'lines'">
              <p class="cui-input-hint w-full self-stretch text-pretty">{{ $t(`components.zone_editor.${activeTab}_hint`) }}</p>

              <div class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].name`" class="cui-label">{{ $t('components.form.label.name') }}</label>
                <InputGroup>
                  <InputText
                    :model-value="polygons[selectedZone]?.name"
                    :invalid="!!selectedZoneNameError"
                    :loading="isLoading"
                    :disabled="selectedZone < 0"
                    type="text"
                    @value-change="
                      (e) => {
                        if (polygons[selectedZone]) polygons[selectedZone].name = e ?? '';
                      }
                    "
                  />
                </InputGroup>

                <Transition name="fade">
                  <span v-if="selectedZoneNameError" class="cui-input-error">{{ selectedZoneNameError }}</span>
                </Transition>
              </div>

              <div v-if="tabHasLabels" class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].labels`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.form.label.labels') }}
                  <span v-tooltip="{ value: $t(`components.zone_editor.${activeTab}_labels_info`) }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <MultiSelect
                    :model-value="activeTab === 'alert' ? alertLabelModel : labelledZone(selectedZone)?.labels"
                    :options="activeTab === 'alert' ? alertLabelOptions : activeTab === 'object' ? objectLabelOptions : spatialLabelOptions"
                    :loading="isLoading"
                    :disabled="selectedZone < 0"
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
                        if (activeTab === 'alert') {
                          setAlertLabels(e);
                          return;
                        }
                        const zone = labelledZone(selectedZone);
                        if (zone) zone.labels = e ?? [];
                      }
                    "
                  />
                </InputGroup>

                <Transition name="fade">
                  <p v-if="undetectedAlertLabels.length" class="cui-input-hint text-pretty">
                    {{ $t('components.zone_editor.alert_conflict', { labels: undetectedAlertLabels.join(', ') }) }}
                  </p>
                </Transition>
              </div>

              <div v-if="activeTab === 'alert' && alertZones[selectedZone]?.faces" class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].faces`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.zone_editor.alert_faces') }}
                  <span v-tooltip="{ value: $t('components.zone_editor.alert_faces_info') }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <MultiSelect
                    :model-value="alertZones[selectedZone]?.faces ?? []"
                    :options="faceOptions"
                    :loading="isLoading"
                    :max-selected-labels="2"
                    :show-toggle-all="false"
                    option-label="label"
                    option-value="value"
                    filter
                    show-clear
                    type="text"
                    @value-change="
                      (e) => {
                        const zone = alertZones[selectedZone];
                        if (zone) zone.faces = e ?? [];
                      }
                    "
                  />
                </InputGroup>
              </div>

              <div v-if="activeTab === 'alert' && alertZones[selectedZone]?.plates" class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].plates`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.zone_editor.alert_plates') }}
                  <span v-tooltip="{ value: $t('components.zone_editor.alert_plates_info') }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <AutoComplete
                    :model-value="alertZones[selectedZone]?.plates ?? []"
                    multiple
                    :typeahead="false"
                    :placeholder="$t('components.zone_editor.alert_plates_placeholder')"
                    class="w-full"
                    @update:model-value="
                      (e) => {
                        const zone = alertZones[selectedZone];
                        if (zone) zone.plates = (e as string[]) ?? [];
                      }
                    "
                  />
                </InputGroup>
              </div>

              <div v-if="activeTab === 'privacy'" class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].dropDetections`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.zone_editor.privacy_drop') }}
                  <span v-tooltip="{ value: $t('components.zone_editor.privacy_drop_info') }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <Select
                    :model-value="privacyZones[selectedZone]?.dropDetections ?? true"
                    :options="privacyDropOptions"
                    :loading="isLoading"
                    :disabled="selectedZone < 0"
                    option-label="label"
                    option-value="value"
                    @value-change="
                      (e) => {
                        if (privacyZones[selectedZone]) privacyZones[selectedZone].dropDetections = e;
                      }
                    "
                  />
                </InputGroup>
              </div>

              <div v-if="activeTab === 'privacy'" class="flex flex-col field-gap w-full">
                <label for="privacyFallback" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.zone_editor.privacy_fallback') }}
                  <span v-tooltip="{ value: $t('components.zone_editor.privacy_fallback_info') }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <Select v-model="privacyFallback" :options="privacyFallbackOptions" :loading="isLoading" option-label="label" option-value="value" />
                </InputGroup>
              </div>

              <div v-if="activeTab === 'object' || activeTab === 'alert'" class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].match`" class="cui-label inline-flex items-center gap-1">
                  {{ $t('components.zone_editor.zone_match') }}
                  <span v-tooltip="{ value: $t(`components.zone_editor.${activeTab}_match_info`) }" class="inline-flex shrink-0">
                    <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                  </span>
                </label>
                <InputGroup>
                  <Select
                    :model-value="activeTab === 'alert' ? (alertZones[selectedZone]?.match ?? 'contain') : (objectZones[selectedZone]?.type ?? 'intersect')"
                    :options="activeTab === 'alert' ? alertMatchOptions : objectMatchOptions"
                    :loading="isLoading"
                    :disabled="selectedZone < 0"
                    option-label="label"
                    option-value="value"
                    @value-change="(e) => setMatch(e)"
                  />
                </InputGroup>
              </div>

              <div v-if="activeTab !== 'privacy'" class="flex flex-col field-gap w-full">
                <label :for="`zone[${selectedZone}].color`" class="cui-label">{{ $t('components.form.label.color') }}</label>
                <InputGroup>
                  <InputText :model-value="colouredZone(selectedZone)?.color" :loading="isLoading" readonly type="text" />
                  <InputGroupAddon>
                    <ColorPicker
                      :key="`${activeTab}-${selectedZone}`"
                      :model-value="colouredZone(selectedZone)?.color"
                      format="hex"
                      @value-change="
                        (e) => {
                          const zone = colouredZone(selectedZone);
                          if (e && zone) zone.color = `#${e}`;
                        }
                      "
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
                  :disabled="Boolean(currentZone !== undefined && polygons[currentZone]?.points?.length < 3)"
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
                  :disabled="!polygons.length || selectedZone < 0 || customizing"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="editZone"
                >
                  <template #icon>
                    <i-mdi:pencil width="20px" height="20px" />
                  </template>
                </Button>

                <Button
                  v-tooltip.top="{ value: $t('components.form.tooltip.delete_zone') }"
                  :loading="isLoading"
                  :disabled="!polygons.length || selectedZone < 0"
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
                  :disabled="!polygons.length"
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
                  :disabled="!polygons.length"
                  severity="secondary"
                  class="!rounded-none !h-full w-[60px]"
                  @click="clear"
                >
                  <template #icon>
                    <i-mdi:cancel width="20px" height="20px" />
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
import { useFaceStore } from '@camera.ui/nvr';
import { DETECTION_LABELS } from '@camera.ui/sdk';
import Draggabilly from 'draggabilly';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { detectionLabelKey } from '@/common/eventLabels.js';
import { deepToRaw } from '@/common/utils.js';
import { cameraCreatePatchLines, cameraCreatePatchObjectZones } from '@/schemas/cameras.schema.js';
import { NON_TRACKED_LABELS } from './types.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { AlertZone, DetectionLabel, DetectionLine, LineDirection, MotionZone, ObjectZone, Point, PrivacyFallback, PrivacyZone } from '@camera.ui/sdk';
import type { ComputedRef } from 'vue';
import type { CoordsPosition, EditorPolygon, LabelGroup, ZoneEditorProps, ZoneEditorTab } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<ZoneEditorProps>();

const toast = useCuiToast();
const { t } = useI18n();
const faceStore = useFaceStore();

const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: patchZoneConfig, isPending: patchZoneConfigLoading } = camerasQuery.patchZoneConfigQuery();

const { cameraName, zones } = toRefs(props);
const cameraCardRef = useTemplateRef<{ videoBoxRef: HTMLElement | null }>('cameraCardRef');
const containerRef = useTemplateRef('container');
const draggablesRef = useTemplateRef<HTMLElement[]>('draggablesRef');
const outsideRef = useTemplateRef('outsideRef');
const playgroundContainerRef = useTemplateRef<HTMLElement>('playgroundContainerRef');
const activeTab = ref<ZoneEditorTab>(props.initialTab ?? 'motion');
const draggies = shallowRef<Draggabilly[]>([]);
const motionZones = ref<MotionZone[]>([]);
const objectZones = ref<ObjectZone[]>([]);
const privacyZones = ref<PrivacyZone[]>([]);
const privacyFallback = ref<PrivacyFallback>('send');
const alertZones = ref<AlertZone[]>([]);
const detectionLines = ref<DetectionLine[]>([]);
const customizing = ref(false);
const coords = ref<CoordsPosition[]>([]);
const currentZone = ref<number | undefined>(undefined);
const selectedZone = ref(-1);
const selectedAction = ref(-1);
const selectedLine = ref(-1);

if (props.initialSelection !== undefined) {
  if ((props.initialTab ?? 'zones') === 'lines') {
    selectedLine.value = props.initialSelection;
  } else {
    selectedZone.value = props.initialSelection;
  }
}
const dragStart = { x: 0, y: 0 };

let isDragging = false;
let handleDragging = false;
let activeHandle: { zoneIndex: number; pointIndex: number } | null = null;
let draggingLine: { lineIndex: number; pointIndex: number } | null = null;

const containerSize = useElementSize(containerRef);
const playgroundSize = useElementSize(playgroundContainerRef);
const videoSize = useElementSize(() => cameraCardRef.value?.videoBoxRef ?? null);

const zoneNameSchema = cameraCreatePatchObjectZones.element.shape.name;
const lineNameSchema = cameraCreatePatchLines.element.shape.name;

const ALERT_FACES = '__faces__';
const ALERT_PLATES = '__plates__';
const FACE_ANY_KNOWN = '__known__';
const FACE_UNKNOWN = 'unknown';

function polygonsFor(tab: ZoneEditorTab): EditorPolygon[] {
  if (tab === 'motion') return motionZones.value as EditorPolygon[];
  if (tab === 'object') return objectZones.value as EditorPolygon[];
  if (tab === 'privacy') return privacyZones.value as EditorPolygon[];
  return alertZones.value as EditorPolygon[];
}

const polygons = computed(() => polygonsFor(activeTab.value)) as ComputedRef<EditorPolygon[]>;

const tabHasLabels = computed(() => activeTab.value === 'object' || activeTab.value === 'alert');

// an alert zone can only fire for types the object zones let through
const undetectedAlertLabels = computed(() => {
  if (activeTab.value !== 'alert' || selectedZone.value < 0) return [];

  const include = objectZones.value;
  if (include.length === 0 || include.some((zone) => zone.labels.length === 0)) return [];

  const detected = new Set(include.flatMap((zone) => zone.labels));
  return (alertZones.value[selectedZone.value]?.labels ?? []).filter((label) => !detected.has(label));
});

const polygonDashed = computed(() => activeTab.value === 'alert' || activeTab.value === 'motion');

function labelledZone(index: number): ObjectZone | AlertZone | undefined {
  if (activeTab.value === 'object') return objectZones.value[index];
  if (activeTab.value === 'alert') return alertZones.value[index];
  return undefined;
}

function colouredZone(index: number): MotionZone | ObjectZone | AlertZone | undefined {
  const zone = polygons.value[index];
  return zone && 'color' in zone ? zone : undefined;
}

function polygonStyle(zone: EditorPolygon): Record<string, string> {
  if (!('color' in zone)) {
    return { fill: '#000', stroke: '#000', 'stroke-width': '2' };
  }
  return { fill: `${zone.color}4D`, stroke: zone.color, 'stroke-width': '2' };
}

const selectedZoneNameError = computed(() => {
  if (selectedZone.value < 0) return '';
  const zone = polygons.value[selectedZone.value];
  if (!zone) return '';
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

const contentWidth = computed(() => Math.max(0, playgroundSize.width.value - 20));
const contentHeight = computed(() => Math.max(0, playgroundSize.height.value - 20));

const playgroundStyle = computed(() => {
  const width = videoSize.width.value;
  const height = videoSize.height.value;

  if (!width || !height) {
    return { width: '100%', height: '100%' };
  }

  return { width: `${width + 20}px`, height: `${height + 20}px` };
});

const tabOptions = computed(() => [
  { label: t('components.zone_editor.tab_motion'), value: 'motion' as const },
  { label: t('components.zone_editor.tab_object'), value: 'object' as const },
  { label: t('components.zone_editor.tab_alert'), value: 'alert' as const },
  { label: t('components.zone_editor.tab_privacy'), value: 'privacy' as const },
  { label: t('components.zone_editor.tab_lines'), value: 'lines' as const },
]);

const spatialLabelOptions = computed<LabelGroup[]>(() => {
  const filteredLabels = DETECTION_LABELS.filter((label) => !NON_TRACKED_LABELS.includes(label));

  if (filteredLabels.length === 0) return [];

  return [
    {
      label: t('components.zone_editor.base_labels'),
      items: filteredLabels.map((label) => ({ label: t(detectionLabelKey(label)), value: label })),
    },
  ];
});

const lineLabelOptions = spatialLabelOptions;

const objectLabelOptions = computed<LabelGroup[]>(() => [
  ...spatialLabelOptions.value,
  {
    label: t('components.zone_editor.identify_group'),
    items: [
      { label: t('components.zone_editor.identify_faces'), value: 'face' },
      { label: t('components.zone_editor.identify_plates'), value: 'license_plate' },
    ],
  },
]);

const alertLabelOptions = computed<LabelGroup[]>(() => [
  ...spatialLabelOptions.value,
  {
    label: t('components.zone_editor.alert_attributes'),
    items: [
      { label: t('components.zone_editor.alert_faces'), value: ALERT_FACES },
      { label: t('components.zone_editor.alert_plates'), value: ALERT_PLATES },
    ],
  },
]);

const alertLabelModel = computed<string[]>(() => {
  const zone = alertZones.value[selectedZone.value];
  if (!zone) return [];
  const selected: string[] = [...zone.labels];
  if (zone.faces) selected.push(ALERT_FACES);
  if (zone.plates) selected.push(ALERT_PLATES);
  return selected;
});

const faceOptions = computed(() => [
  { label: t('components.zone_editor.alert_face_unknown'), value: FACE_UNKNOWN },
  { label: t('components.zone_editor.alert_face_any_known'), value: FACE_ANY_KNOWN },
  ...faceStore.knownFaces.value.map((face) => ({ label: face.name, value: face.name })),
]);

const alertMatchOptions = computed(() => [
  { label: t('components.zone_editor.match_anchor'), value: 'anchor' as const },
  { label: t('components.zone_editor.match_intersect'), value: 'intersect' as const },
  { label: t('components.zone_editor.match_contain'), value: 'contain' as const },
]);

const objectMatchOptions = computed(() => [
  { label: t('components.zone_editor.match_intersect'), value: 'intersect' as const },
  { label: t('components.zone_editor.match_contain'), value: 'contain' as const },
]);

const lineDirectionOptions = computed(() => [
  { label: `A ↔ B  ${t('components.zone_editor.line_direction_both')}`, value: 'both' as const },
  { label: 'A → B', value: 'a-to-b' as const },
  { label: 'B → A', value: 'b-to-a' as const },
]);

const privacyFallbackOptions = computed(() => [
  { label: t('components.zone_editor.privacy_fallback_send'), value: 'send' as const },
  { label: t('components.zone_editor.privacy_fallback_drop'), value: 'drop' as const },
]);

const privacyDropOptions = computed(() => [
  { label: t('components.zone_editor.privacy_drop_on'), value: true },
  { label: t('components.zone_editor.privacy_drop_off'), value: false },
]);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || patchZoneConfigLoading.value));

const playgroundClasses = computed(() => {
  const classes: string[] = [];

  if (customizing.value) {
    classes.push('customizing');
  }

  if (!polygons.value?.length) {
    classes.push('start');
  }

  return classes.join(' ');
});

function setMatch(value: 'anchor' | 'intersect' | 'contain'): void {
  if (activeTab.value === 'alert') {
    const zone = alertZones.value[selectedZone.value];
    if (zone) zone.match = value;
    return;
  }
  const zone = objectZones.value[selectedZone.value];
  if (zone && value !== 'anchor') zone.type = value;
}

function setAlertLabels(next: string[] | undefined): void {
  const zone = alertZones.value[selectedZone.value];
  if (!zone) return;

  const chosen = next ?? [];
  const wantsFaces = chosen.includes(ALERT_FACES);
  const wantsPlates = chosen.includes(ALERT_PLATES);
  const labels = chosen.filter((value) => value !== ALERT_FACES && value !== ALERT_PLATES) as DetectionLabel[];

  if (wantsFaces && !labels.includes('person')) labels.push('person');
  if (wantsPlates && !labels.includes('vehicle')) labels.push('vehicle');

  zone.labels = labels;
  zone.faces = wantsFaces ? (zone.faces ?? []) : undefined;
  zone.plates = wantsPlates ? (zone.plates ?? []) : undefined;
}

function updateCoordinatesFromZones() {
  if (!polygons.value) return;

  if (polygons.value.length === 0) {
    coords.value = [];
    return;
  }

  coords.value = polygons.value.flatMap((zone, zoneIndex) => {
    return zone.points.map((point: Point, pointIndex: number) => {
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
  if (customizing.value || !playgroundContainerRef.value) {
    return;
  }

  e.stopPropagation();

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
  if (!isDragging || !playgroundContainerRef.value || selectedZone.value === -1 || !polygons.value.length) {
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

  const points = polygons.value[selectedZone.value].points;
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

function addZone(points: [number, number][]): void {
  const color = getRandomHexColor();
  const stamp = Date.now();

  if (activeTab.value === 'motion') {
    motionZones.value.push({ name: `motion-${stamp}`, points: [...points], color });
  } else if (activeTab.value === 'object') {
    objectZones.value.push({ name: `object-${stamp}`, points: [...points], type: 'intersect', labels: [], color });
  } else if (activeTab.value === 'privacy') {
    privacyZones.value.push({ name: `privacy-${stamp}`, points: [...points], dropDetections: true });
  } else {
    alertZones.value.push({ name: `alert-${stamp}`, points: [...points], labels: [], match: 'contain', color });
  }
}

function addHandle(e: MouseEvent): void {
  if (!customizing.value || isDragging || handleDragging) {
    return;
  }

  if ((e.target as Element | null)?.closest('.handle')) {
    return;
  }

  if (!playgroundContainerRef.value) {
    return;
  }

  const zoneIndex = currentZone.value !== undefined ? currentZone.value : polygons.value.length;
  const rect = playgroundContainerRef.value.getBoundingClientRect();
  const x = Math.min(Math.max(Math.round(((e.clientX - rect.left - 10) / contentWidth.value) * 100), 0), 100);
  const y = Math.min(Math.max(Math.round(((e.clientY - rect.top - 10) / contentHeight.value) * 100), 0), 100);

  if (currentZone.value === undefined) {
    addZone([]);
    currentZone.value = polygons.value.length - 1;
  }

  if (!polygons.value[zoneIndex]) {
    currentZone.value = undefined;
    return;
  }

  const points = polygons.value[zoneIndex].points;
  const anchor = activeHandle?.zoneIndex === zoneIndex ? activeHandle.pointIndex : points.length - 1;
  const insertAt = anchor + 1;

  points.splice(insertAt, 0, [x, y]);
  activeHandle = { zoneIndex, pointIndex: insertAt };

  updateCoordinatesFromZones();
  nextTick(() => resetHandles());
}

function updateHandle(payload: CoordsPosition): void {
  if (!polygons.value.length) {
    return;
  }

  const x = Math.round((payload.point[0] / contentWidth.value) * 100);
  const y = Math.round((payload.point[1] / contentHeight.value) * 100);

  polygons.value[payload.zoneIndex].points[payload.pointIndex] = [x, y];
}

function startCustomizing(): void {
  customizing.value = true;
  currentZone.value = undefined;
  activeHandle = null;
  paintActiveHandle();
}

function finishCustomizing(inEdit: boolean, tab: ZoneEditorTab = activeTab.value): void {
  if (currentZone.value === undefined) {
    customizing.value = false;
    return;
  }

  customizing.value = inEdit || false;
  const zoneIndex = currentZone.value;
  currentZone.value = undefined;

  const zones = polygonsFor(tab);
  if (!zones[zoneIndex]?.points) {
    return;
  }

  if (zones[zoneIndex].points.length < 3) {
    zones.splice(zoneIndex, 1);
    updateCoordinatesFromZones();
  } else if (tab === activeTab.value) {
    resetHandles();
    selectedZone.value = zoneIndex;
  }
}

function editZone(): void {
  customizing.value = true;
  currentZone.value = selectedZone.value;

  const points = polygons.value[selectedZone.value]?.points;
  activeHandle = points?.length ? { zoneIndex: selectedZone.value, pointIndex: points.length - 1 } : null;
  paintActiveHandle();
}

function removeZone(): void {
  if (selectedZone.value === -1 || !polygons.value.length) {
    return;
  }

  if (currentZone.value === selectedZone.value) {
    currentZone.value = undefined;
    customizing.value = false;
  }

  polygons.value.splice(selectedZone.value, 1);
  selectedZone.value = Math.max(-1, selectedZone.value - 1);
  activeHandle = null;

  updateCoordinatesFromZones();
  nextTick(() => {
    resetHandles();
  });
}

function undo(): void {
  if (!polygons.value?.length) {
    return;
  }

  if (customizing.value && currentZone.value !== undefined) {
    const zone = polygons.value[currentZone.value];
    if (zone.points.length) {
      zone.points.pop();

      if (zone.points.length === 0) {
        polygons.value.splice(currentZone.value, 1);
        currentZone.value = undefined;
      }

      updateCoordinatesFromZones();
    }
    return;
  }

  if (polygons.value.length > 0) {
    polygons.value.pop();

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

  if (polygons.value) {
    polygons.value.length = 0;
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

  if (activeHandle?.zoneIndex !== index) {
    const points = polygons.value[index]?.points;
    activeHandle = points?.length ? { zoneIndex: index, pointIndex: points.length - 1 } : null;
    paintActiveHandle();
  }
}

function resetHandles(): void {
  clearDraggies();

  draggablesRef.value?.forEach((el: HTMLElement) => {
    if (!el.dataset.zoneIndex || !el.dataset.pointIndex) {
      return;
    }

    const zoneIndex = parseInt(el.dataset.zoneIndex);
    const pointIndex = parseInt(el.dataset.pointIndex);

    if (!polygons.value[zoneIndex] || !polygons.value[zoneIndex].points[pointIndex]) {
      return;
    }

    const point = polygons.value[zoneIndex].points[pointIndex];

    if (point) {
      styleHandle(el, point);
      makeDraggable(el);
    }
  });

  paintActiveHandle();
}

function paintActiveHandle(): void {
  const zone = activeHandle ? polygons.value[activeHandle.zoneIndex] : undefined;
  if (!zone?.points.length) {
    activeHandle = null;
  } else if (activeHandle && activeHandle.pointIndex >= zone.points.length) {
    activeHandle = { zoneIndex: activeHandle.zoneIndex, pointIndex: zone.points.length - 1 };
  }

  draggablesRef.value?.forEach((el: HTMLElement) => {
    const isActive = !!activeHandle && el.dataset.zoneIndex === String(activeHandle.zoneIndex) && el.dataset.pointIndex === String(activeHandle.pointIndex);
    el.classList.toggle('active', isActive);
    el.classList.toggle('show-delete', isActive);
  });
}

function clearDraggies(): void {
  draggies.value.forEach((draggie) => draggie.destroy());
  draggies.value = [];
}

function removeHandler(coord: CoordsPosition): void {
  if (!polygons.value.length || !polygons.value[coord.zoneIndex]) {
    return;
  }

  const zone = polygons.value[coord.zoneIndex];
  zone.points.splice(coord.pointIndex, 1);

  if (zone.points.length === 0) {
    polygons.value.splice(coord.zoneIndex, 1);
    activeHandle = null;

    if (currentZone.value === coord.zoneIndex) {
      currentZone.value = undefined;
    } else if (currentZone.value !== undefined && currentZone.value > coord.zoneIndex) {
      currentZone.value -= 1;
    }

    if (selectedZone.value >= coord.zoneIndex) {
      selectedZone.value = Math.max(-1, selectedZone.value - 1);
    }
  } else if (activeHandle?.zoneIndex === coord.zoneIndex && activeHandle.pointIndex >= coord.pointIndex) {
    activeHandle = { zoneIndex: coord.zoneIndex, pointIndex: Math.max(0, activeHandle.pointIndex - 1) };
  }

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
      handleDragging = true;
      if (el.dataset.zoneIndex && el.dataset.pointIndex) {
        const zoneIndex = parseInt(el.dataset.zoneIndex);
        selectZone(zoneIndex);
        activeHandle = { zoneIndex, pointIndex: parseInt(el.dataset.pointIndex) };
        paintActiveHandle();
      }
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
      setTimeout(() => {
        handleDragging = false;
      }, 100);
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
    labels: ['person', 'vehicle', 'animal'],
    color: getRandomHexColor(),
  });
  selectedLine.value = detectionLines.value.length - 1;
}

function removeLine(): void {
  if (selectedLine.value < 0 || !detectionLines.value.length) return;
  detectionLines.value.splice(selectedLine.value, 1);
  selectedLine.value = Math.max(-1, selectedLine.value - 1);
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
  const incomplete = [...motionZones.value, ...objectZones.value, ...privacyZones.value, ...alertZones.value].filter((zone) => zone.points.length < 3);

  if (incomplete.length) {
    toast.add({ severity: 'error', detail: t('components.toast.zone_incomplete', { zones: incomplete.map((zone) => zone.name).join(', ') }), life: 5000 });
    return null;
  }

  try {
    await patchZoneConfig({
      cameraname: cameraName.value,
      zones: {
        privacyFallback: privacyFallback.value,
        motion: motionZones.value,
        object: objectZones.value,
        privacy: privacyZones.value,
        alert: alertZones.value,
        lines: detectionLines.value,
      },
    });
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
  if (newZone === -1 && polygons.value?.length && polygons.value[oldZone]) {
    selectedZone.value = oldZone;
    return;
  }

  if (newZone === -1 && polygons.value?.length) {
    selectedAction.value = 0;
  }
});

watch(
  zones,
  () => {
    motionZones.value = deepToRaw(zones.value.motion ?? []);
    objectZones.value = deepToRaw(zones.value.object ?? []);
    privacyZones.value = deepToRaw(zones.value.privacy ?? []);
    privacyFallback.value = zones.value.privacyFallback ?? 'send';
    alertZones.value = deepToRaw(zones.value.alert ?? []);
    detectionLines.value = deepToRaw(zones.value.lines ?? []);
    updateCoordinatesFromZones();
  },
  { deep: true, immediate: true },
);

watch(
  activeTab,
  (tab, previous) => {
    if (tab === 'lines') {
      if (detectionLines.value.length && (selectedLine.value < 0 || selectedLine.value >= detectionLines.value.length)) {
        selectedLine.value = 0;
      }
      return;
    }

    if (!polygons.value.length) {
      selectedZone.value = -1;
    } else if (selectedZone.value < 0 || selectedZone.value >= polygons.value.length) {
      selectedZone.value = 0;
    }

    if (previous && previous !== tab) {
      finishCustomizing(false, previous);
      updateCoordinatesFromZones();
      nextTick(() => {
        resetHandles();
      });
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
  position: relative;
  flex-shrink: 0;
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
    box-shadow:
      #fff inset 0 0 0 10px,
      0 0 0 2px rgba(0, 0, 0, 0.65);
    opacity: 0.8;
    transition: opacity 0.25s;

    &.is-dragging,
    &.is-pointer-down {
      z-index: 100;
      box-shadow:
        #d0d0d0 inset 0 0 0 10px,
        0 0 0 2px rgba(0, 0, 0, 0.65);
      cursor: none;
      transition: box-shadow 0s;
    }

    &.active {
      opacity: 1;
      outline: 2px solid var(--primary-500);
      outline-offset: 2px;
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
