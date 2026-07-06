<template>
  <div ref="editorRef" class="h-full bg-none"></div>
</template>

<script lang="ts" setup>
// @ts-expect-error
await import('./ace.config');

import { CUI_EDITOR_DEFAULT_OPTIONS, CUI_EDITOR_DEFAULTS } from './types.js';

import type { Ace } from 'ace-builds';
import type { CuiEditorEmits, CuiEditorProps } from './types.js';

const ace = await import('ace-builds');

const props = withDefaults(defineProps<CuiEditorProps>(), CUI_EDITOR_DEFAULTS);
const emit = defineEmits<CuiEditorEmits>();
const model = defineModel<string>({ required: true });

const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);

const {
  readOnly,
  options,
  lang,
  printMargin,
  placeholder,
  borderRadius,
  borderBottomLeftRadius,
  borderTopLeftRadius,
  borderTopRightRadius,
  borderBottomRightRadius,
  border,
} = toRefs(props);

const editorRef = useTemplateRef<HTMLElement>('editorRef');
const editor = shallowRef<Ace.Editor>();
const isSettingContent = ref(false);
const contentBackup = ref('');

const editorTopRightRadius = computed(() => {
  return borderRadius.value || borderTopRightRadius.value ? '10px' : '0px';
});

const editorBottomRightRadius = computed(() => {
  return borderRadius.value || borderBottomRightRadius.value ? '10px' : '0px';
});

const editorBottomLeftRadius = computed(() => {
  return borderRadius.value || borderBottomLeftRadius.value ? '10px' : '0px';
});

const editorTopLeftRadius = computed(() => {
  return borderRadius.value || borderTopLeftRadius.value ? '10px' : '0px';
});

const editorBorder = computed(() => {
  return border.value ? '1px solid var(--border-color)' : 'none';
});

useResizeObserver(editorRef, () => {
  if (editor.value) {
    editor.value.resize(true);
  }
});

watch(model, (val) => {
  if (contentBackup.value !== val) {
    try {
      isSettingContent.value = true;
      editor.value?.setValue(val, 1);
    } finally {
      isSettingContent.value = false;
    }
    contentBackup.value = val;
  }
});

watch(lang, (state) => {
  editor.value?.setOption('mode', 'ace/mode/' + state);
});

watch(options, (val) => {
  if (val) {
    editor.value?.setOptions(val);
  }
});

watch(placeholder, (val) => {
  if (val !== undefined) {
    editor.value?.setOption('placeholder', val);
  }
});

watch(readOnly, (val) => {
  editor.value?.setReadOnly(val);
});

watch(printMargin, (val) => {
  editor.value?.setOption('printMargin', val);
});

watch(theme, (val) => {
  if (editor.value) {
    const themeName = val === 'dark' ? 'twilight' : 'github';
    editor.value.setOption('theme', 'ace/theme/' + themeName);
  }
});

onMounted(() => {
  if (editorRef.value) {
    editor.value = ace.edit(editorRef.value, {
      placeholder: placeholder.value,
      readOnly: readOnly.value,
      value: model.value,
      mode: 'ace/mode/' + lang.value,
      theme: theme.value === 'dark' ? 'ace/theme/twilight' : 'ace/theme/github',
      printMargin: printMargin.value,
      fadeFoldWidgets: true,
      ...CUI_EDITOR_DEFAULT_OPTIONS,
      ...options.value,
    });

    editor.value.on('change', () => {
      // ref: https://github.com/CarterLi/vue3-ace-editor/issues/11
      if (isSettingContent.value) {
        return;
      }

      const content = editor.value!.getValue();
      contentBackup.value = content;
      model.value = content;
    });

    editor.value.on('blur', (e: Event) => {
      emit('blur', e);
    });

    editor.value.on('input', () => {
      emit('input');
    });

    editor.value.on('change', (delta: Ace.Delta) => {
      emit('change', delta);
    });

    editor.value.on('changeSelectionStyle', (data: 'text' | 'line' | 'fullLine' | 'screenLine') => {
      emit('changeSelectionStyle', data);
    });

    editor.value.on('changeSession', (obj: { session: Ace.EditSession; oldSession: Ace.EditSession }) => {
      emit('changeSession', obj);
    });

    editor.value.on('copy', (obj: { text: string }) => {
      emit('copy', obj);
    });

    editor.value.on('focus', (e: Event) => {
      emit('focus', e);
    });

    editor.value.on('paste', (e: { text: string; event?: ClipboardEvent }) => {
      emit('paste', e.text);
    });

    emit('init', editor.value);
  }
});

onUnmounted(() => {
  editor.value?.removeAllListeners();
  editor.value?.destroy();
});
</script>

<style>
.ace_gutter {
  background: var(--subnavbar-background) !important;
  /* border-right: 1px solid var(--border-color) !important; */
  border: none !important;
}

.ace-twilight,
.ace-tomorrow-night {
  background: none !important;
}

.ace_active-line {
  background: var(--border-color) !important;
}

.ace_scroller {
  background: var(--editor-background) !important;
  border-bottom: v-bind(editorBorder);
  border-left: 1px solid var(--border-color) !important;
  border-right: v-bind(editorBorder);
  border-bottom-left-radius: v-bind(editorBottomLeftRadius);
  border-bottom-right-radius: v-bind(editorBottomRightRadius);
  border-top-left-radius: v-bind(editorTopLeftRadius);
  border-top-right-radius: v-bind(editorTopRightRadius);
}
</style>
