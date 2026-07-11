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

              <template v-for="(url, i2) in source.urls" :key="i2">
                <div v-if="isGeneratedUrl(url)" class="w-full flex flex-row gap-2">
                  <InputGroup>
                    <InputText :model-value="url" readonly :loading="busy" type="text" />
                  </InputGroup>
                </div>

                <Field v-else v-slot="{ errors }" :model-value="url" :name="`sources[${i}].urls[${i2}]`" as="div" class="flex flex-col field-gap w-full">
                  <InputGroup>
                    <InputText
                      :model-value="url"
                      :invalid="errors.length > 0"
                      :loading="busy"
                      type="text"
                      :placeholder="URL_PLACEHOLDER"
                      @update:model-value="(value) => setUrl(i, i2, value ?? '')"
                    />

                    <InputGroupAddon>
                      <Button
                        v-tooltip.top="{ value: $t('components.dialog.components.new_camera.protocol_info') }"
                        text
                        rounded
                        severity="secondary"
                        :disabled="busy || !hasProtocolHelp(url)"
                        class="border-right-color"
                        @click="openProtocolHelp(url)"
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
                        :disabled="busy || !detectProtocol(url)"
                        class="border-right-color"
                        @click="testSource(url)"
                      >
                        <template #icon>
                          <i-material-symbols:camera-rounded width="100%" height="100%" />
                        </template>
                      </Button>

                      <Button v-if="source.urls.length > 1" text rounded severity="danger" :disabled="busy" @click.prevent="deleteUrl(i, i2)">
                        <template #icon>
                          <i-mdi:close width="100%" height="100%" />
                        </template>
                      </Button>
                    </InputGroupAddon>
                  </InputGroup>

                  <Transition name="fade">
                    <ErrorMessage :name="`sources[${i}].urls[${i2}]`" class="cui-input-error" />
                  </Transition>

                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{
                      detectProtocol(url) ? $t('components.form.hint.source_detected_protocol', { protocol: detectProtocol(url) }) : $t('components.form.hint.source_url')
                    }}
                  </Message>
                </Field>
              </template>

              <Button
                v-if="!isManagedSource(source)"
                :loading="busy"
                :label="$t('components.form.button.add_source')"
                class="ml-auto cui-button-medium"
                @click="addUrl(i)"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { ErrorMessage, Field } from 'vee-validate';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { detectProtocol, isGeneratedUrl, normalizeSource } from '@/common/cameraSources.js';
import { randomLetter } from '@/common/utils.js';

import type { Go2RtcModel } from '@/common/cameraSources.js';
import type { CameraRole } from '@camera.ui/sdk';
import type { CuiCameraSourcesProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = withDefaults(defineProps<CuiCameraSourcesProps>(), {
  allowAddRemoveSources: false,
});

const dialog = useCuiDialog();
const { t } = useI18n();

const { mutateAsync: previewCamera, isPending: previewLoading } = camerasQuery.previewCameraQuery();

const protocolHelpFiles = import.meta.glob('../../markdowns/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

const URL_PLACEHOLDER = 'rtsp://user:pass@192.168.1.50:554/stream';

const sourceRoles = ref<CameraRole[]>(['high-resolution', 'mid-resolution', 'low-resolution', 'snapshot']);
const sourcePanels = ref(props.sources.map((_, i) => i));

const busy = computed(() => props.isLoading || previewLoading.value);

function isManagedSource(source: Go2RtcModel): boolean {
  return source.urls.some(isGeneratedUrl);
}

function protocolHelp(url: string): string | undefined {
  const protocol = detectProtocol(url);
  if (!protocol) return undefined;
  const key = protocol.replace(/[:/]+$/, '');
  return protocolHelpFiles[`../../markdowns/${key}.md`];
}

function hasProtocolHelp(url: string): boolean {
  return !!protocolHelp(url);
}

/* eslint-disable vue/no-mutating-props -- sources is the parent dialog's reactive array; this component owns its row/source mutations */
function addUrl(i: number): void {
  props.sources[i].urls.push('');
}

function deleteUrl(i: number, i2: number): void {
  props.sources[i].urls.splice(i2, 1);
}

function setUrl(i: number, i2: number, value: string): void {
  props.sources[i].urls[i2] = value;
}

function newSource(): void {
  props.sources.push({
    _id: randomLetter(8),
    name: '',
    role: null as any,
    urls: [''],
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

function openProtocolHelp(url: string): void {
  const md = protocolHelp(url);
  if (!md) return;

  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.information'),
      hideConfirmButton: true,
      contentText: md,
      markdown: true,
    },
  });
}

async function testSource(url: string): Promise<void> {
  const normalized = normalizeSource(url);
  if (!normalized) return;

  try {
    const previewBuffer = await previewCamera({ cameraData: { url: normalized } });

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
}

defineExpose({
  newSource,
});
</script>

<style scoped></style>
