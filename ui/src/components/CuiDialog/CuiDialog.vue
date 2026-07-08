<template>
  <div class="p-dialog-content non-draggable-region">
    <div
      ref="dialogHeader"
      class="p-dialog-header justify-start gap-1"
      :class="{
        'cursor-move': draggable,
        'pt-6!': isElectronApp && (fullscreen || mdBreakpoint),
      }"
    >
      <Transition name="slide-left">
        <div v-if="showBackButton" class="p-dialog-header-actions">
          <Button severity="secondary" text rounded class="p-dialog-back-button" @click="stepper?.goToMainTab">
            <template #icon>
              <i-octicon:chevron-left-16 width="100%" height="100%" />
            </template>
          </Button>
        </div>
      </Transition>

      <span class="p-dialog-title truncate min-w-0 flex-1">{{ dialogTitle }}</span>

      <div class="p-dialog-header-actions ml-auto gap-2">
        <Button
          v-for="(action, idx) in headerActions ?? []"
          :key="idx"
          v-tooltip.bottom="action.tooltip ? { value: action.tooltip } : undefined"
          severity="secondary"
          text
          rounded
          :loading="action.loading"
          class="p-dialog-close-button"
          :class="{ '!text-primary': action.toggle && headerActionToggles[idx] }"
          @click="
            () => {
              if (action.toggle) headerActionToggles[idx] = !headerActionToggles[idx];
              action.onClick();
            }
          "
        >
          <template #icon>
            <component :is="action.icon" width="100%" height="100%" />
          </template>
        </Button>
        <Button
          v-if="goTo"
          v-tooltip.bottom="{ value: $t('components.dialog.open') }"
          severity="secondary"
          text
          rounded
          class="p-dialog-close-button"
          @click="goToPage(goTo)"
        >
          <template #icon>
            <i-fluent:open-16-filled width="100%" height="100%" />
          </template>
        </Button>
        <Button severity="secondary" text rounded class="p-dialog-close-button" @click="dialogRef.close">
          <template #icon>
            <i-mdi:close width="100%" height="100%" />
          </template>
        </Button>
      </div>
    </div>

    <div
      :class="[
        'p-dialog-body flex justify-center w-full overflow-y-auto px-5 py-1 text-balance',
        {
          'h-full': fullscreen,
        },
        dialogContentClass,
      ]"
      :style="dialogContentStyle"
    >
      <span v-if="contentText && !md" class="text-wrap">{{ contentText }}</span>
      <CuiMarkdownContent v-else-if="contentText && md" :content="contentText" />
      <CuiImage v-else-if="src" :src image-container-class="w-full h-full" />
      <component :is="templates?.content" v-else ref="componentRef" class="w-full h-full relative" v-bind="contentProps" v-on="dialogRef.options.events || {}" />
    </div>

    <div class="mt-auto"></div>

    <div
      v-if="!hideCancelButton || !hideConfirmButton"
      class="flex items-center justify-center shrink-0 w-full p-5 pb-safe-offset-5 mt-5 self-end"
      :style="{
        background: 'var(--border-color)',
      }"
    >
      <Button v-if="!hideCancelButton" v-bind="cancelProps" class="cui-button-medium" @click="onCancel" />
      <div class="ml-auto" />
      <Button v-if="!hideConfirmButton" v-bind="confirmProps" :loading="isLoading" :disabled="disabled" class="cui-button-medium" @click="onConfirm" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { asyncComponent } from '@/common/asyncComponent.js';

import type { ContentProps, CustomDialogComponent, DeepShallowRef, DialogTemplates } from '@/composables/useCuiDialog.js';
import type { ButtonProps } from 'primevue';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';

const CuiMarkdownContent = asyncComponent(() => import('@/components/CuiMarkdownContent/CuiMarkdownContent.vue'));

const router = useRouter();
const toast = useCuiToast();
const { t } = useI18n();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth, height: windowHeight } = useSharedWindowSize();
const { isElectronApp } = useElectron();

const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef')!;

const dialogHeader = useTemplateRef<HTMLElement>('dialogHeader');
const props = toRefs(dialogRef.value.data as ContentProps) as DeepShallowRef<ContentProps>;
const {
  contentText,
  contentProps,
  loading,
  disabled,
  cancelButtonProps,
  confirmButtonProps,
  hideCancelButton,
  hideConfirmButton,
  dialogContentClass,
  dialogContentStyle,
  cancelText,
  confirmText,
  stayActive,
  src,
  title,
  fullscreen,
  tabs,
  goTo,
  draggable,
  rootId,
  markdown: md,
  headerActions,
} = props;
provide('dialogRefProps', props);

const headerActionToggles = reactive<Record<number, boolean>>({});
provide('dialogHeaderToggles', headerActionToggles);

const templates = dialogRef.value.options.templates as Partial<DialogTemplates> | undefined;
const appEl = useElementSize(document.getElementById('app'));

const componentIsLoading = ref(false);
const componentRef = ref<CustomDialogComponent | null>(null);
const showBackButton = ref(false);
const dialogTitle = ref(title.value);
const hasDragged = ref(false);

let stepper: ReturnType<typeof useCuiDialogStepper> | undefined;

const { style, x, y } = useDraggable(dialogHeader, {
  disabled: !draggable?.value,
  containerElement() {
    return document.getElementById('app');
  },
  onStart() {
    hasDragged.value = true;
  },
});

const maxX = computed(() => {
  const rootElement = document.getElementById(rootId?.value || '');
  if (!rootElement) return Infinity;

  const dialogWidth = rootElement.offsetWidth;
  return appEl.width.value - dialogWidth;
});

const maxY = computed(() => {
  const rootElement = document.getElementById(rootId?.value || '');
  if (!rootElement) return Infinity;

  const dialogHeight = rootElement.offsetHeight;
  return appEl.height.value - dialogHeight;
});

const isLoading = computed(() => Boolean(componentIsLoading.value || loading?.value || toValue(componentRef.value?.isLoading)));

const isStepper = computed(() => tabs.value !== undefined && tabs.value.length > 0);

const cancelLabel = computed(() => {
  if (cancelText?.value) {
    return cancelText.value;
  } else {
    return t('components.form.button.close');
  }
});

const confirmLabel = computed(() => {
  if (confirmText?.value) {
    return confirmText.value;
  } else {
    return t('components.form.button.save');
  }
});

const cancelProps = computed<ButtonProps>(() => {
  return {
    ...cancelButtonProps?.value,
    label: cancelLabel.value,
    loading: undefined, // controlled by the dialog
    size: 'small',
    severity: cancelButtonProps?.value && 'severity' in cancelButtonProps.value ? cancelButtonProps.value.severity : 'secondary',
    class: undefined,
  };
});

const confirmProps = computed<ButtonProps>(() => {
  return {
    ...confirmButtonProps?.value,
    label: confirmLabel.value,
    loading: undefined, // controlled by the dialog
    size: 'small',
    severity: confirmButtonProps?.value && 'severity' in confirmButtonProps.value ? confirmButtonProps.value.severity : 'success',
    class: 'ml-auto',
    disabled: disabled.value,
  };
});

function goToPage(path: string): void {
  const resolved = componentRef.value?.resolveGoTo?.();
  dialogRef.value.close();
  router.push(resolved ?? path);
}

async function onCancel() {
  try {
    componentIsLoading.value = true;
    const data = await componentRef.value?.onCancel?.();
    dialogRef.value.close({ status: 'cancel', data });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  } finally {
    componentIsLoading.value = false;
  }
}

async function onConfirm() {
  try {
    componentIsLoading.value = true;
    const data = await componentRef.value?.onConfirm?.();

    if (data === null) {
      return;
    }

    if (!stayActive?.value) {
      dialogRef.value.close({ status: 'confirm', data });
    } else {
      dialogRef.value.options.onConfirm?.(data);
    }
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  } finally {
    componentIsLoading.value = false;
  }
}

function bringToFront(): void {
  const rootElement = document.getElementById(rootId?.value || '');
  const mask = rootElement?.closest('.p-dialog-mask') as HTMLElement | null;
  if (!mask) return;

  const allMasks = Array.from(document.querySelectorAll<HTMLElement>('.p-dialog-mask'));
  let maxZ = 0;
  for (const m of allMasks) {
    const z = parseInt(m.style.zIndex, 10) || 0;
    if (z > maxZ) maxZ = z;
  }

  const currentZ = parseInt(mask.style.zIndex, 10) || 0;
  if (currentZ < maxZ) {
    mask.style.zIndex = String(maxZ + 1);
  }
}

if (isStepper.value) {
  stepper = useCuiDialogStepper(tabs.value ?? []);

  watch(
    stepper.isMainTab,
    (isMain) => {
      showBackButton.value = !isMain;
    },
    { immediate: true },
  );

  stepper.on('updateTabTitle', ({ tabId, title: newTitle }) => {
    if (stepper?.currentTab.value === tabId && title?.value) {
      dialogTitle.value = newTitle;
    }
  });

  stepper.on('tabChange', (tab) => {
    dialogTitle.value = tab?.title ?? title.value;
  });
}

watch([style, windowWidth, windowHeight], () => {
  if (!hasDragged.value) return;

  const rootElement = document.getElementById(rootId?.value || '');
  if (rootElement) {
    const boundedX = Math.max(0, Math.min(x.value, maxX.value));
    const boundedY = Math.max(0, Math.min(y.value, maxY.value));

    rootElement.style.left = `${boundedX}px`;
    rootElement.style.top = `${boundedY}px`;
  }
});

onMounted(() => {
  const rootElement = document.getElementById(rootId?.value || '');
  const mask = rootElement?.closest('.p-dialog-mask') as HTMLElement | null;
  if (mask) {
    mask.addEventListener('pointerdown', bringToFront);
    bringToFront();
  }
});

onUnmounted(() => {
  const rootElement = document.getElementById(rootId?.value || '');
  const mask = rootElement?.closest('.p-dialog-mask') as HTMLElement | null;
  if (mask) {
    mask.removeEventListener('pointerdown', bringToFront);
  }
});
</script>

<style scoped></style>
