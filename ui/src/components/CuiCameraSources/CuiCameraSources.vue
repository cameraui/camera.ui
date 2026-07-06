<template>
  <div class="flex flex-col gap-6">
    <Accordion v-model:value="sourcePanels" multiple>
      <AccordionPanel
        v-for="(source, i) in sources"
        :key="source._id"
        :value="i"
        :class="{
          'border-b-0': i === sources.length - 1,
        }"
      >
        <AccordionHeader
          :class="{
            'px-0 pt-0': i === 0,
            'px-0': i !== 0,
            'pb-5': i === sources.length - 1,
          }"
        >
          <div class="flex gap-2 items-center w-full">
            <div class="flex gap-2 items-center w-full">
              <span class="text-color text-sm">{{ $t('components.dialog.components.new_camera.source') + ': ' }}</span>
              <Chip
                class="text-color text-xs border-[1px] bg-primary-500/20 border-primary-500/30 py-2 px-3 rounded-full overflow-hidden"
                :label="source.name !== '' ? source.name : $t('components.dialog.components.new_camera.unknown')"
              />
            </div>
            <Button
              v-if="allowAddRemoveSources && sources.length > 1"
              text
              rounded
              severity="danger"
              class="cui-icon-md ml-auto mr-2"
              :loading="busy"
              @click="removeSource(i)"
            >
              <template #icon>
                <i-mdi:close width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </AccordionHeader>
        <AccordionContent
          :pt="{
            content: {
              class: {
                'px-0': true,
                'pb-5': i === sources.length - 1,
              },
            },
          }"
        >
          <div class="flex flex-col gap-6">
            <Field v-slot="{ field, errors }" v-model.trim="source.name" :name="`sources[${i}].name`" as="div" class="flex flex-col field-gap">
              <label :for="`sources[${i}].name`" class="cui-label">{{ $t('components.form.label.source_name') }}</label>
              <InputGroup>
                <InputText v-bind="field" :invalid="errors.length > 0" :loading="busy" type="text" />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage :name="`sources[${i}].name`" class="cui-input-error" />
              </Transition>

              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.source_name')
              }}</Message>
            </Field>

            <Field v-slot="{ errors }" :model-value="source.role" :name="`sources[${i}].role`" as="div" class="flex flex-col field-gap">
              <label :for="`sources[${i}].role`" class="cui-label">{{ $t('components.form.label.source_role') }}</label>
              <InputGroup>
                <Select
                  :model-value="source.role"
                  :options="sourceRoles.filter((role) => !sources.some((s) => s.role === role && s._id !== source._id))"
                  :invalid="errors.length > 0"
                  :loading="busy"
                  @value-change="(e) => (source.role = e)"
                />
              </InputGroup>

              <Transition name="fade">
                <ErrorMessage :name="`sources[${i}].role`" class="cui-input-error" />
              </Transition>

              <Message v-if="!errors.length" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('components.form.hint.source_role')
              }}</Message>
            </Field>

            <div class="w-full flex flex-col gap-2">
              <Field
                v-if="source.role !== 'snapshot' && sources.length > 1"
                v-slot="{ field, errors }"
                :model-value="source.useForSnapshot"
                :value="true"
                :unchecked-value="false"
                type="checkbox"
                :name="`sources[${i}].useForSnapshot`"
                as="div"
                class="flex flex-col field-gap cui-toggle-switch"
              >
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label :for="`sources[${i}].useForSnapshot`" class="cui-label-switch">{{ $t('components.form.label.use_for_snapshot') }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.use_for_snapshot') }}</Message>

                    <Transition name="fade">
                      <ErrorMessage :name="`sources[${i}].useForSnapshot`" class="cui-input-switch-error" />
                    </Transition>
                  </div>

                  <ToggleSwitch
                    :model-value="source.useForSnapshot"
                    v-bind="field"
                    :invalid="errors.length > 0"
                    :loading="busy"
                    :disabled="sources.some((s) => (s.useForSnapshot || s.role === 'snapshot') && s._id !== source._id)"
                    class="ml-auto shrink-0"
                    @value-change="(e) => (source.useForSnapshot = e)"
                  />
                </div>
              </Field>

              <Field
                v-if="source.role !== 'snapshot'"
                v-slot="{ field, errors }"
                :model-value="source.hotMode"
                :value="true"
                :unchecked-value="false"
                type="checkbox"
                :name="`sources[${i}].hotMode`"
                as="div"
                class="flex flex-col field-gap cui-toggle-switch"
              >
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label :for="`sources[${i}].hotMode`" class="cui-label-switch">{{ $t('components.form.label.hot_mode') }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.hot_mode') }}</Message>

                    <Transition name="fade">
                      <ErrorMessage :name="`sources[${i}].hotMode`" class="cui-input-switch-error" />
                    </Transition>
                  </div>

                  <ToggleSwitch
                    :model-value="source.hotMode"
                    v-bind="field"
                    :invalid="errors.length > 0"
                    :loading="busy"
                    class="ml-auto shrink-0"
                    @value-change="(e) => (source.hotMode = e)"
                  />
                </div>
              </Field>

              <Field
                v-if="source.role !== 'snapshot'"
                v-slot="{ field, errors }"
                :model-value="source.preload"
                :value="true"
                :unchecked-value="false"
                type="checkbox"
                :name="`sources[${i}].preload`"
                as="div"
                class="flex flex-col field-gap cui-toggle-switch"
              >
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label :for="`sources[${i}].preload`" class="cui-label-switch">{{ $t('components.form.label.preload') }}</label>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('components.form.hint.preload') }}</Message>

                    <Transition name="fade">
                      <ErrorMessage :name="`sources[${i}].preload`" class="cui-input-switch-error" />
                    </Transition>
                  </div>

                  <ToggleSwitch
                    :model-value="source.preload"
                    v-bind="field"
                    :invalid="errors.length > 0"
                    :loading="busy"
                    class="ml-auto shrink-0"
                    @value-change="(e) => (source.preload = e)"
                  />
                </div>
              </Field>
            </div>

            <div class="flex flex-col gap-6">
              <div class="flex flex-col field-gap">
                <label :for="`sources[${i}].urls[]`" class="cui-label">{{ $t('components.form.label.sources') }}</label>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                  isManagedSource(source) ? $t('views.devices.managed_source_hint') : $t('components.form.hint.source_urls')
                }}</Message>
              </div>

              <template v-for="(urlField, i2) in source.urls" :key="i2">
                <div v-if="isManagedUrlEntry(urlField)" class="w-full flex flex-row gap-2">
                  <InputGroup>
                    <InputText :model-value="fixSource(urlField)" readonly :loading="busy" type="text" />
                  </InputGroup>
                </div>

                <div v-else>
                  <Field
                    v-if="smBreakpoint"
                    v-slot="{ errors }"
                    :model-value="urlField.protocol"
                    :name="`sources[${i}].urls[${i2}].protocol`"
                    as="div"
                    class="flex flex-col field-gap mb-2"
                  >
                    <InputGroup>
                      <Select
                        :model-value="urlField.protocol"
                        :options="sourcePrefixes as unknown as string[]"
                        :invalid="errors.length > 0"
                        :loading="busy"
                        @update:model-value="(newVal) => updateProtocol(newVal, urlField)"
                      />

                      <InputGroupAddon>
                        <Button
                          v-tooltip.top="{ value: $t('components.dialog.components.new_camera.protocol_info') }"
                          text
                          rounded
                          severity="secondary"
                          :loading="busy"
                          @click="openDialog(undefined, urlField.protocol)"
                        >
                          <template #icon>
                            <i-mdi:information width="100%" height="100%" />
                          </template>
                        </Button>
                      </InputGroupAddon>
                    </InputGroup>

                    <Transition name="fade">
                      <ErrorMessage :name="`sources[${i}].urls[${i2}].protocol`" class="cui-input-error" />
                    </Transition>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.source_protocol') }}</Message>
                  </Field>

                  <div class="w-full flex flex-row my-1 gap-2">
                    <Field
                      v-if="!smBreakpoint"
                      v-slot="{ errors }"
                      :model-value="urlField.protocol"
                      :name="`sources[${i}].urls[${i2}].protocol`"
                      as="div"
                      class="flex flex-col field-gap max-w-[125px]"
                    >
                      <InputGroup>
                        <Select
                          :model-value="urlField.protocol"
                          :options="sourcePrefixes as unknown as string[]"
                          :invalid="errors.length > 0"
                          :loading="busy"
                          :pt="{ root: { class: 'rounded-r-none' } }"
                          @update:model-value="(newVal) => updateProtocol(newVal, urlField)"
                        />
                      </InputGroup>

                      <Transition name="fade">
                        <ErrorMessage :name="`sources[${i}].urls[${i2}].protocol`" class="cui-input-error" />
                      </Transition>

                      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.source_protocol') }}</Message>
                    </Field>

                    <Field v-slot="{ field, errors }" :model-value="urlField.url" :name="`sources[${i}].urls[${i2}].url`" as="div" class="flex flex-col field-gap w-full">
                      <InputGroup>
                        <AutoComplete
                          :model-value="urlField.url"
                          :invalid="errors.length > 0"
                          :loading="busy"
                          multiple
                          fluid
                          :typeahead="false"
                          :suggestions="activePresets"
                          :pt="{ inputMultiple: { class: 'rounded-none overflow-y-scroll max-h-[42px]' } }"
                          @complete="listPresets(getPresets(urlField.protocol).presets)"
                          @hide="activePresets = []"
                          @value-change="(e) => (field.value = e) && (urlField.url = e)"
                        >
                          <template #dropdown="{ toggleCallback }">
                            <InputGroupAddon>
                              <Button text rounded severity="secondary" :disabled="busy" class="border-right-color" @click="toggleCallback">
                                <template #icon>
                                  <i-fluent:chevron-down-12-filled v-if="!busy" />
                                </template>
                              </Button>
                            </InputGroupAddon>
                          </template>
                        </AutoComplete>

                        <InputGroupAddon>
                          <Button
                            v-if="!smBreakpoint"
                            v-tooltip.top="{ value: $t('components.dialog.components.new_camera.protocol_info') }"
                            text
                            rounded
                            severity="secondary"
                            :disabled="busy"
                            class="border-right-color"
                            @click="openDialog(undefined, urlField.protocol)"
                          >
                            <template #icon>
                              <i-mdi:information width="100%" height="100%" />
                            </template>
                          </Button>

                          <Button
                            v-tooltip.top="{ value: $t('components.dialog.components.new_camera.test_source') }"
                            text
                            rounded
                            severity="secondary"
                            :disabled="!urlField.protocol || !urlField.url.length || busy"
                            class="border-right-color"
                            @click="openDialog(urlField)"
                          >
                            <template #icon>
                              <i-material-symbols:camera-rounded width="100%" height="100%" />
                            </template>
                          </Button>

                          <Button v-if="source.urls.length > 1" text rounded severity="danger" :disabled="busy" @click.prevent="deleteSource(i, i2)">
                            <template #icon>
                              <i-mdi:close width="100%" height="100%" />
                            </template>
                          </Button>
                        </InputGroupAddon>
                      </InputGroup>

                      <Transition name="fade">
                        <ErrorMessage :name="`sources[${i}].urls[${i2}].url`" class="cui-input-error" />
                      </Transition>

                      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.source_url') }}</Message>
                      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.type_and_enter') }}</Message>
                    </Field>
                  </div>
                </div>
              </template>

              <Button
                v-if="!isManagedSource(source)"
                :loading="busy"
                :label="$t('components.form.button.add_source')"
                class="ml-auto cui-button-medium"
                @click="addSource(i)"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { ffmpegPresets, homekitPresets, httpPresets, nestPresets, ringPresets, rtspPresets, sourcePrefixes, webrtcPresets } from '@shared/types';
import { ErrorMessage, Field } from 'vee-validate';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { fixSource, isManagedUrlEntry } from '@/common/cameraSources.js';
import { randomLetter } from '@/common/utils.js';

import type { CameraRole } from '@camera.ui/sdk';
import type { SourcePrefixes } from '@shared/types';
import type { Go2RtcModel, Go2RtcSourcesModel } from '@/common/cameraSources.js';
import type { CuiCameraSourcesProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = withDefaults(defineProps<CuiCameraSourcesProps>(), {
  allowAddRemoveSources: false,
});

const dialog = useCuiDialog();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();

const { mutateAsync: previewCamera, isPending: previewLoading } = camerasQuery.previewCameraQuery();

const sourceRoles = ref<CameraRole[]>(['high-resolution', 'mid-resolution', 'low-resolution', 'snapshot']);
const sourcePanels = ref(props.sources.map((_, i) => i));
const activePresets = ref<string[]>([]);

const busy = computed(() => props.isLoading || previewLoading.value);

function isManagedSource(source: Go2RtcModel): boolean {
  return source.urls.some(isManagedUrlEntry);
}

/* eslint-disable vue/no-mutating-props -- sources is the parent dialog's reactive array; this component owns its row/source mutations */
function addSource(i: number): void {
  props.sources[i].urls.push({ protocol: 'rtsp://', url: [] });
}

function deleteSource(i: number, i2: number): void {
  props.sources[i].urls.splice(i2, 1);
}

function newSource(): void {
  props.sources.push({
    _id: randomLetter(8),
    name: '',
    role: null as any,
    urls: [
      {
        protocol: 'rtsp://',
        url: [],
      },
    ],
    useForSnapshot: false,
    hotMode: true,
    preload: true,
  });

  sourcePanels.value = [props.sources.length];
}

function removeSource(i: number): void {
  props.sources.splice(i, 1);
}
/* eslint-enable vue/no-mutating-props */

function getPresets(source: SourcePrefixes): { presets: string[]; md?: string } {
  let presets: readonly string[];
  let mdFile: Record<string, any> | undefined;
  let md: string | undefined;

  switch (source) {
    case 'bubble://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/bubble.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'cui://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/cui.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'doorbird://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/doorbird.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'dvrip://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/dvrip.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'echo:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/echo.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'eseecloud://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/eseecloud.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'exec:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/exec.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'expr:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/expr.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'ffmpeg:':
      presets = ffmpegPresets;
      mdFile = import.meta.glob('../../markdowns/ffmpeg.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'flussonic://':
      presets = ffmpegPresets;
      mdFile = import.meta.glob('../../markdowns/flussonic.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'gopro://':
      presets = ffmpegPresets;
      mdFile = import.meta.glob('../../markdowns/gopro.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'hass:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/hass.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'homekit://':
      presets = homekitPresets;
      mdFile = import.meta.glob('../../markdowns/homekit.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'http://':
    case 'https://':
    case 'httpx://':
    case 'tcp://':
      presets = httpPresets;
      mdFile = import.meta.glob('../../markdowns/http.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'isapi://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/isapi.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'ivideon:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/ivideon.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'kasa://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/kasa.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'nest:':
      presets = nestPresets;
      mdFile = import.meta.glob('../../markdowns/nest.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'onvif://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/onvif.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'ring:':
      presets = ringPresets;
      mdFile = import.meta.glob('../../markdowns/ring.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'roborock://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/roborock.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'rtmp://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/rtmp.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'rtsp://':
    case 'rtspx://':
      presets = rtspPresets;
      mdFile = import.meta.glob('../../markdowns/rtsp.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'tapo://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/tapo.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'tuya://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/tuya.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'xiaomi://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/xiaomi.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'yandex:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/yandex.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'webrtc:':
      presets = webrtcPresets;
      mdFile = import.meta.glob('../../markdowns/webrtc.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'webtorrent:':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/webtorrent.md', { eager: true, query: '?raw', import: 'default' });
      break;
    case 'wyze://':
      presets = [];
      mdFile = import.meta.glob('../../markdowns/wyze.md', { eager: true, query: '?raw', import: 'default' });
      break;
    default:
      presets = [];
      mdFile = undefined;
      break;
  }

  if (mdFile) {
    md = Object.values(mdFile)[0];
  }

  return {
    presets: presets as string[],
    md,
  };
}

function listPresets(presets: string[]): void {
  activePresets.value = presets;
}

function updateProtocol(value: SourcePrefixes, urlField: Go2RtcSourcesModel): void {
  urlField.protocol = value;
}

async function openDialog(source?: Go2RtcSourcesModel, protocol?: SourcePrefixes): Promise<void> {
  if (!source && !protocol) {
    return;
  }

  if (source) {
    const cameraData: { url: string } = {
      url: fixSource(source),
    };

    try {
      const previewBuffer = await previewCamera({ cameraData });

      dialog.openImageDialog({
        data: {
          title: t('components.dialog.title.preview'),
          src: `data:image/jpeg;base64,${previewBuffer}`,
          hideConfirmButton: true,
        },
      });
    } catch {
      //
    }
  } else if (protocol) {
    const preset = getPresets(protocol);
    if (!preset.md) {
      return;
    }
    dialog.openTextDialog({
      data: {
        title: t('components.dialog.title.information'),
        hideConfirmButton: true,
        contentText: preset.md,
        markdown: true,
      },
    });
  }
}

defineExpose({
  newSource,
});
</script>

<style scoped></style>
