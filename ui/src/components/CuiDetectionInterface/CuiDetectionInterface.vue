<template>
  <div>
    <div
      class="file-upload-box"
      @drop.prevent="onDrop($event)"
      @dragover.prevent="dragover = true"
      @dragenter.prevent="dragover = true"
      @dragleave.prevent="dragover = false"
    >
      <div v-if="!uploadedFiles.length" class="w-full">
        <div class="flex flex-col justify-center items-center mb-5">
          <label for="restoreInput" class="cursor-pointer text-center text-sm">
            {{ $t(`components.detection_interface.${dropLabelKey}`) }}
          </label>

          <input id="restoreInput" ref="fileInputRef" type="file" class="hidden" :accept="accept" @change="onSelect" />

          <p v-if="dragoverError" class="text-red-500 text-sm">
            {{ $t(`components.detection_interface.only_one_${fileType}_allowed`) }}
          </p>
          <p v-if="requiredError" class="text-red-500 text-sm" :class="{ 'mt-2': dragoverError }">
            {{ $t(`components.detection_interface.${fileType}_required`) }}
          </p>
          <p v-if="fileSizeError" class="text-red-500 text-sm" :class="{ 'mt-2': dragoverError || requiredError }">
            {{ $t(`components.detection_interface.file_size_error`) }}
          </p>
        </div>
      </div>

      <div v-else class="w-full flex flex-col items-center justify-center">
        <div v-if="fileType === 'image'" class="relative mb-4">
          <img :src="mediaUrl" alt="Preview" class="w-full" />
        </div>

        <div v-else-if="fileType === 'video'" class="relative mb-4 w-full">
          <video ref="videoPlayerRef" controls class="w-full">Your browser does not support the video tag.</video>
        </div>

        <div v-else-if="fileType === 'audio'" class="relative mb-4 w-full">
          <audio ref="audioPlayerRef" controls class="w-full">
            <source :src="mediaUrl" :type="uploadedFiles[0].type" />
            Your browser does not support the audio element.
          </audio>
        </div>

        <div class="flex items-center justify-center">
          <Button text rounded severity="danger" class="cui-icon-md shrink-0" @click.stop="removeFile(uploadedFiles[0].name)">
            <template #icon>
              <i-mdi:close-circle width="100%" height="100%" />
            </template>
          </Button>

          <b class="mx-2">{{ uploadedFiles[0].name }}</b>

          <span class="text-muted">({{ formatFileSize(uploadedFiles[0].size) }})</span>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-center mt-2 text-xs text-muted">
      <span>({{ maxFileSize / 1024 / 1024 }}MB, {{ acceptedTypes.join(', ') }})</span>
    </div>

    <div class="mt-10">
      <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">
        {{ $t('components.detection_interface.interface_config') }}
      </h3>

      <div v-if="!pluginInterfaceSchema?.length" class="flex items-center justify-center text-sm text-muted mt-5">
        {{ $t('components.detection_interface.no_interface_config') }}
      </div>

      <CuiSchema
        v-else
        :schema-form="{ schema: pluginInterfaceSchema, config: {} }"
        :loading="isLoading"
        :save-button-label="$t('components.detection_interface.detect')"
        :disable-button="actionButtonDisabled"
        show-button
        @on-form-submit="onFormSubmit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import PluginClipInterfaceDialog from '@/components/CuiDialog/templates/PluginClipInterface/PluginClipInterface.vue';
import PluginMotionInterfaceDialog from '@/components/CuiDialog/templates/PluginMotionInterface/PluginMotionInterface.vue';
import PluginObjectInterfaceDialog from '@/components/CuiDialog/templates/PluginObjectInterface/PluginObjectInterface.vue';
import {
  ACCEPTED_AUDIO_TYPES,
  ACCEPTED_MOTION_VIDEO_TYPES,
  ACCEPTED_OBJECT_IMAGE_TYPES,
  MAX_AUDIO_FILE_SIZE,
  MAX_IMAGE_FILE_SIZE,
  MAX_MOTION_FILE_SIZE,
} from '@shared/types';

import type { PluginMotionInterfaceProps } from '@/components/CuiDialog/templates/PluginMotionInterface/types.js';
import type { PluginObjectInterfaceProps } from '@/components/CuiDialog/templates/PluginObjectInterface/types.js';
import type { AudioMetadata, ImageMetadata, JsonSchema } from '@camera.ui/sdk';
import type { PluginClipInterfaceProps } from '../CuiDialog/templates/PluginClipInterface/types.js';
import type { CuiDetectionInterfaceEmits, CuiDetectionInterfaceProps } from './types.js';

const DROP_LABEL_KEYS: Record<CuiDetectionInterfaceProps['type'], string> = {
  motionDetection: 'drop_or_select_video_to_detect_motion',
  audioDetection: 'drop_or_select_audio_to_detect',
  objectDetection: 'drop_or_select_image_to_detect_objects',
  faceDetection: 'drop_or_select_image_to_detect_faces',
  licensePlateDetection: 'drop_or_select_image_to_detect_license_plates',
  classifierDetection: 'drop_or_select_image_to_classify',
  clipDetection: 'drop_or_select_image_for_semantic_search',
};

const props = defineProps<CuiDetectionInterfaceProps>();

const emit = defineEmits<CuiDetectionInterfaceEmits>();

const log = useLogger();
const { t } = useI18n();
const toast = useCuiToast();
const dialog = useCuiDialog();

const { type, pluginName } = toRefs(props);

const { plugin: pluginProxy, isLoading: pluginLoading } = usePlugin(pluginName);

const fileInputRef = useTemplateRef('fileInputRef');
const videoPlayerRef = useTemplateRef('videoPlayerRef');
const audioPlayerRef = useTemplateRef('audioPlayerRef');
const uploadedFiles = shallowRef<File[]>([]);
const dragover = ref(false);
const dragoverError = ref(false);
const requiredError = ref(false);
const fileSizeError = ref(false);
const mediaUrl = ref('');
const loading = ref(false);
const metadata = ref<ImageMetadata | AudioMetadata | undefined>();
const actionButtonDisabled = ref(true);
const pluginInterfaceSchema = shallowRef<JsonSchema[] | undefined>();
const schemaLoading = ref(false);

const isLoading = computed(() => schemaLoading.value || pluginLoading.value || loading.value);

const dropLabelKey = computed(() => DROP_LABEL_KEYS[type.value]);

const fileType = computed<'image' | 'video' | 'audio'>(() => {
  switch (type.value) {
    case 'objectDetection':
    case 'faceDetection':
    case 'licensePlateDetection':
    case 'classifierDetection':
    case 'clipDetection':
      return 'image';
    case 'motionDetection':
      return 'video';
    case 'audioDetection':
      return 'audio';
    default:
      return 'image';
  }
});

const acceptedTypes = computed<string[]>(() => {
  switch (fileType.value) {
    case 'image':
      return ACCEPTED_OBJECT_IMAGE_TYPES;
    case 'video':
      return ACCEPTED_MOTION_VIDEO_TYPES;
    case 'audio':
      return ACCEPTED_AUDIO_TYPES;
    default:
      return [];
  }
});

const maxFileSize = computed(() => {
  switch (fileType.value) {
    case 'image':
      return MAX_IMAGE_FILE_SIZE;
    case 'video':
      return MAX_MOTION_FILE_SIZE;
    case 'audio':
      return MAX_AUDIO_FILE_SIZE;
    default:
      return 0;
  }
});

const accept = computed(() => acceptedTypes.value.join(','));

async function loadInterfaceSchema(): Promise<void> {
  if (!pluginProxy.value) return;

  schemaLoading.value = true;
  try {
    let schema: JsonSchema[] | undefined;

    switch (type.value) {
      case 'motionDetection':
        schema = await pluginProxy.value.motionDetectionSettings?.();
        break;
      case 'objectDetection':
        schema = await pluginProxy.value.objectDetectionSettings?.();
        break;
      case 'audioDetection':
        schema = await pluginProxy.value.audioDetectionSettings?.();
        break;
      case 'faceDetection':
        schema = await pluginProxy.value.faceDetectionSettings?.();
        break;
      case 'licensePlateDetection':
        schema = await pluginProxy.value.licensePlateDetectionSettings?.();
        break;
      case 'classifierDetection':
        schema = await pluginProxy.value.classifierDetectionSettings?.();
        break;
      case 'clipDetection':
        schema = await pluginProxy.value.clipSettings?.();
        break;
    }

    pluginInterfaceSchema.value = schema;
  } catch (err) {
    log.error('Failed to load interface schema:', err);
    pluginInterfaceSchema.value = undefined;
  } finally {
    schemaLoading.value = false;
  }
}

function removeFile(fileName: string): void {
  const index = uploadedFiles.value.findIndex((file: File) => file.name === fileName);

  if (index > -1) {
    uploadedFiles.value.splice(index, 1);
    resetFileInput();
    mediaUrl.value = '';

    if (fileType.value === 'video' && videoPlayerRef.value) {
      videoPlayerRef.value.src = '';
    }

    metadata.value = undefined;
    emit('update:file', null);
    emit('update:metadata', null);
  }
}

function onDrop(e: DragEvent): void {
  dragover.value = false;
  dragoverError.value = false;
  fileSizeError.value = false;
  uploadedFiles.value = [];

  if (e.dataTransfer) {
    if (e.dataTransfer.files.length > 1) {
      dragoverError.value = true;
    } else {
      const file = e.dataTransfer.files[0];
      // empty acceptedTypes means allow all
      const isTypeAccepted = acceptedTypes.value.length === 0 || acceptedTypes.value.includes(file.type);

      if (isTypeAccepted && file.size <= maxFileSize.value) {
        uploadedFiles.value.push(file);

        nextTick(() => {
          createMediaPreview(file);
        });
      } else if (file.size > maxFileSize.value) {
        fileSizeError.value = true;
      } else {
        dragoverError.value = true;
      }
    }
  }
}

function onSelect(e: Event) {
  dragoverError.value = false;
  fileSizeError.value = false;
  uploadedFiles.value = [];
  const input = e.target as HTMLInputElement;

  if (input && input.files) {
    if (input.files?.length > 1) {
      dragoverError.value = true;
    } else if (input.files.length === 1) {
      const file = input.files[0];
      const isTypeAccepted = acceptedTypes.value.length === 0 || acceptedTypes.value.includes(file.type);

      if (file.size <= maxFileSize.value && isTypeAccepted) {
        uploadedFiles.value.push(file);

        nextTick(() => {
          createMediaPreview(file);
        });
      } else if (file.size > maxFileSize.value) {
        fileSizeError.value = true;
      } else {
        dragoverError.value = true;
      }
    }
  }
}

function resetFileInput(): void {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function createMediaPreview(file: File): void {
  loading.value = true;

  const objectUrl = URL.createObjectURL(file);

  switch (fileType.value) {
    case 'image':
      createImagePreview(file, objectUrl);
      break;
    case 'video':
      createVideoPreview(file, objectUrl);
      break;
    case 'audio':
      createAudioPreview(file, objectUrl);
      break;
  }
}

function createImagePreview(file: File, url: string): void {
  const img = new Image();
  img.src = url;

  img.onload = () => {
    mediaUrl.value = img.src;

    const imageMetadata: ImageMetadata = {
      width: img.width,
      height: img.height,
    };

    metadata.value = imageMetadata;
    emit('update:metadata', imageMetadata);
    emit('update:file', file);
    loading.value = false;
  };
}

function createVideoPreview(file: File, url: string): void {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.src = url;
    videoPlayerRef.value.load();

    videoPlayerRef.value.onloadeddata = () => {
      emit('update:file', file);
      loading.value = false;
    };
  }
}

function createAudioPreview(file: File, url: string): void {
  mediaUrl.value = url;

  const audio = new Audio();
  audio.src = url;

  audio.onloadedmetadata = () => {
    const audioMetadata: AudioMetadata = {
      mimeType: file.type as any,
    };

    metadata.value = audioMetadata;
    emit('update:metadata', audioMetadata);
    emit('update:file', file);
    loading.value = false;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

async function onFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!uploadedFiles.value.length) {
    requiredError.value = true;
    return;
  }

  if (!pluginProxy.value) {
    log.error('Plugin not connected');
    return;
  }

  loading.value = true;

  try {
    const fileBuffer = await uploadedFiles.value[0].arrayBuffer();

    if (type.value === 'audioDetection') {
      const response = await pluginProxy.value.testAudioDetection?.(new Uint8Array(fileBuffer), metadata.value as AudioMetadata, configData);

      if (!response) {
        log.warn('No audio detection interface available');
        return;
      }

      if (response.detected && response.detections?.length) {
        const labels = response.detections.map((d) => `${d.label} (${Math.round(d.confidence * 100)}%)`).join(', ');
        const dbInfo = response.decibels != null ? ` | ${response.decibels.toFixed(1)} dBFS` : '';
        toast.add({ severity: 'success', detail: `${labels}${dbInfo}`, life: 3000 });
      } else {
        toast.add({ severity: 'info', detail: t('components.detection_interface.audio_not_detected'), life: 3000 });
      }
    } else if (type.value === 'motionDetection') {
      const response = await pluginProxy.value.testMotionDetection?.(new Uint8Array(fileBuffer), configData);

      if (!response) {
        log.warn('No motion detection interface available');
        return;
      }

      dialog.openComponentDialog<PluginMotionInterfaceProps>(PluginMotionInterfaceDialog, {
        data: {
          title: t('components.dialog.title.result'),
          hideConfirmButton: true,
          contentProps: {
            response,
          },
        },
      });
    } else if (type.value === 'faceDetection') {
      const response = await pluginProxy.value.testFaceDetection?.(new Uint8Array(fileBuffer), metadata.value as ImageMetadata, configData);

      if (!response) {
        log.warn('No face detection interface available');
        return;
      }

      dialog.openComponentDialog<PluginObjectInterfaceProps>(PluginObjectInterfaceDialog, {
        data: {
          title: t('components.dialog.title.result'),
          hideConfirmButton: true,
          contentProps: {
            src: mediaUrl,
            response,
          },
        },
      });
    } else if (type.value === 'licensePlateDetection') {
      const response = await pluginProxy.value.testLicensePlateDetection?.(new Uint8Array(fileBuffer), metadata.value as ImageMetadata, configData);

      if (!response) {
        log.warn('No license plate detection interface available');
        return;
      }

      dialog.openComponentDialog<PluginObjectInterfaceProps>(PluginObjectInterfaceDialog, {
        data: {
          title: t('components.dialog.title.result'),
          hideConfirmButton: true,
          contentProps: {
            src: mediaUrl,
            response,
          },
        },
      });
    } else if (type.value === 'classifierDetection') {
      const response = await pluginProxy.value.testClassifierDetection?.(new Uint8Array(fileBuffer), metadata.value as ImageMetadata, configData);

      if (!response) {
        log.warn('No classifier detection interface available');
        return;
      }

      dialog.openComponentDialog<PluginObjectInterfaceProps>(PluginObjectInterfaceDialog, {
        data: {
          title: t('components.dialog.title.result'),
          hideConfirmButton: true,
          contentProps: {
            src: mediaUrl,
            response,
          },
        },
      });
    } else if (type.value === 'clipDetection') {
      const response = await pluginProxy.value.testClipEmbedding?.(new Uint8Array(fileBuffer), metadata.value as ImageMetadata, configData);

      if (!response) {
        log.warn('No CLIP detection interface available');
        return;
      }

      if (!response.embeddings?.length) {
        toast.add({ severity: 'info', detail: t('components.detection_interface.no_detections'), life: 3000 });
        return;
      }

      const imageEmbedding = response.embeddings[0].embedding;

      dialog.openComponentDialog<PluginClipInterfaceProps>(PluginClipInterfaceDialog, {
        data: {
          title: t('components.dialog.title.result'),
          hideConfirmButton: true,
          contentProps: {
            src: mediaUrl,
            response,
            onTextSearch: async (text: string) => {
              const textResult = await pluginProxy.value!.getTextEmbedding!(text);
              if (!textResult?.embedding?.length) return { score: 0 };
              const score = cosineSimilarity(imageEmbedding, textResult.embedding);
              return { score };
            },
          },
        },
      });
    } else {
      const response = await pluginProxy.value.testObjectDetection?.(new Uint8Array(fileBuffer), metadata.value as ImageMetadata, configData);

      if (!response) {
        log.warn('No object detection interface available');
        return;
      }

      dialog.openComponentDialog<PluginObjectInterfaceProps>(PluginObjectInterfaceDialog, {
        data: {
          title: t('components.dialog.title.result'),
          hideConfirmButton: true,
          contentProps: {
            src: mediaUrl,
            response,
          },
        },
      });
    }
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  } finally {
    loading.value = false;
  }
}

watch(
  pluginProxy,
  (proxy) => {
    if (proxy) {
      loadInterfaceSchema();
    }
  },
  { immediate: true },
);

watch(
  uploadedFiles,
  (newFiles) => {
    if (newFiles.length > 0) {
      requiredError.value = false;
      actionButtonDisabled.value = false;
    } else {
      mediaUrl.value = '';
      metadata.value = undefined;
      actionButtonDisabled.value = true;
    }
  },
  { immediate: true, deep: true },
);
</script>

<style scoped></style>
