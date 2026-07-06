export interface PickOptions {
  accept: string[];
  multiple: boolean;
}

export function useCuiFileDialog(): {
  openDialog: (opts?: Partial<PickOptions>) => void;
  files: any;
} {
  const inputRef = ref<HTMLInputElement | null>(null);
  const files = ref<File[]>([]);

  const openDialog = (opts?: Partial<PickOptions>) => {
    // skip if the input wasn't mounted yet or was removed
    if (!inputRef.value) {
      files.value = [];
      return;
    }

    if (opts?.accept) {
      inputRef.value.accept = opts.accept.map((ext) => `.${ext}`).join(',');
    }

    inputRef.value.multiple = opts?.multiple ?? false;

    inputRef.value.onchange = (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      files.value = fileList ? Array.from(fileList) : [];
      if (inputRef.value) {
        inputRef.value.onchange = null;
      }
    };

    inputRef.value.click();
  };

  onMounted(() => {
    const input = document.createElement('input');

    input.type = 'file';
    input.hidden = true;
    input.className = 'hidden';
    document.body.appendChild(input);
    inputRef.value = input;
  });

  onBeforeUnmount(() => {
    inputRef.value?.remove();
  });

  return {
    files,
    openDialog,
  };
}
