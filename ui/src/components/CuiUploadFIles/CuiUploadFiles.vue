<template>
  <div
    class="file-upload-box"
    @drop.prevent="onDrop($event)"
    @dragover.prevent="dragover = true"
    @dragenter.prevent="dragover = true"
    @dragleave.prevent="dragover = false"
  >
    <div class="flex flex-col gap-6 p-4 items-center justify-center w-full">
      <div class="flex flex-col justify-center items-center">
        <component :is="icon" class="w-15 h-15" />
        <label for="restoreInput" class="cursor-pointer text-center">{{ $t('components.upload_files.drop_or_select_file') }}</label>
        <input id="restoreInput" ref="fileInputRef" type="file" class="hidden" :accept="accept" @change="onSelect" />
        <p v-if="dragoverError" class="text-red">{{ $t('components.upload_files.only_one_file_allowed') }}</p>
      </div>

      <VirtualScroller v-if="uploadedFiles.length > 0" :items="uploadedFiles" :item-size="50" scroll-height="50px" scroll-width="100%" class="w-full">
        <template #item="{ item }">
          <div :key="item.name" class="w-full flex flex-row items-center justify-start p-2">
            <Button text rounded severity="danger" class="cui-icon-md shrink-0" @click="removeFile(item.name)">
              <template #icon>
                <i-mdi:close-circle width="100%" height="100%" />
              </template>
            </Button>
            <b class="mx-2">{{ item.name }}</b>
            <span class="text-muted">({{ item.size }} bytes)</span>
          </div>

          <Divider v-if="uploadedFiles.length > 1" class="m-0 py-4" />
        </template>
      </VirtualScroller>
    </div>
  </div>
</template>

<script lang="ts" setup>
import FileDropIcon from '~icons/ic/baseline-file-open';

import type { CuiUploadFilesEmits, CuiUploadFilesProps } from './types.js';

const props = withDefaults(defineProps<CuiUploadFilesProps>(), {
  multiple: false,
  icon: FileDropIcon,
});

const emit = defineEmits<CuiUploadFilesEmits>();

const { accept, multiple } = toRefs(props);
const fileInputRef = useTemplateRef('fileInputRef');
const uploadedFiles = shallowRef<File[]>([]);
const dragover = ref(false);
const dragoverError = ref(false);

function removeFile(fileName: string) {
  const index = uploadedFiles.value.findIndex((file: File) => file.name === fileName);

  if (index > -1) {
    uploadedFiles.value.splice(index, 1);
    resetFileInput();
  }
}

function onDrop(e: DragEvent) {
  dragover.value = false;
  dragoverError.value = false;
  uploadedFiles.value = [];

  if (e.dataTransfer) {
    if (!multiple.value && e.dataTransfer.files.length > 1) {
      dragoverError.value = true;
    } else {
      for (const [, file] of Object.entries(e.dataTransfer.files)) {
        uploadedFiles.value.push(file);
      }

      emit('files-uploaded', uploadedFiles.value);
    }
  }
}

function onSelect(e: Event) {
  dragoverError.value = false;
  uploadedFiles.value = [];
  const input = e.target as HTMLInputElement;

  if (input && input.files) {
    if (!multiple.value && input.files?.length > 1) {
      dragoverError.value = true;
    } else {
      for (const [, file] of Object.entries(input.files)) {
        uploadedFiles.value.push(file);
      }

      emit('files-uploaded', uploadedFiles.value);
    }
  }
}

function resetFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function reset() {
  uploadedFiles.value = [];
  resetFileInput();
}

defineExpose({
  reset,
});
</script>

<!-- eslint-disable @stylistic/max-len -->
<style scopes>
.file-allow {
  background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='10' ry='10' stroke='%238B8B8BAB' stroke-width='5' stroke-dasharray='6%2c 14' stroke-dashoffset='23' stroke-linecap='round'/%3e%3c/svg%3e");
}
</style>
