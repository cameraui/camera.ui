import { mergeWith } from '@camera.ui/common/utils';
// @ts-expect-error
import DynamicDialogEventBus from 'primevue/dynamicdialogeventbus';

import { randomLetter } from '@/common/utils.js';
import CuiDialog from '@/components/CuiDialog/CuiDialog.vue';

import type { DeepPartial } from '@shared/types';
import type { ButtonProps, DialogProps } from 'primevue';
import type { DynamicDialogInstance, DynamicDialogOptions, DynamicDialogTemplates } from 'primevue/dynamicdialogoptions';
import type { DialogTabConfig } from './useCuiDialogStepper.js';

export type DeepMaybeRef<T> =
  T extends Ref<infer V>
    ? MaybeRef<V>
    : T extends Array<any> | object
      ? {
          [K in keyof T]: DeepMaybeRef<T[K]>;
        }
      : T extends boolean
        ? MaybeRef<boolean>
        : MaybeRef<T>;

export type DeepShallowRef<T> = {
  [K in keyof T]-?: Ref<T[K]>;
};

export interface ContentBaseProps {
  title: string;
  confirmText?: string;
  cancelText?: string;
  hideConfirmButton?: boolean;
  hideCancelButton?: boolean;
  loading?: boolean;
  disabled?: boolean;
  confirmButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  dialogContentClass?: any;
  dialogContentStyle?: any;
  stayActive?: boolean;
  fullscreen?: boolean;
  draggable?: boolean;
  blockDragOnSelectors?: string[];
  dismissableMask?: boolean;
  modal?: boolean;
  goTo?: string;
  rootId?: string;
  headerActions?: { icon: Component; tooltip?: string; onClick: () => void; toggle?: boolean; loading?: boolean }[];
}

export interface ContentTextProps extends ContentBaseProps {
  contentText: string;
  markdown?: boolean;
}

export interface ContentImageProps extends ContentBaseProps {
  src: string;
}

export interface ContentComponentProps<T> extends ContentBaseProps {
  contentProps: T;
}

export interface ContentStepperProps<T> extends ContentComponentProps<T> {
  tabs: DialogTabConfig[];
}

export interface ContentProps extends ContentBaseProps {
  contentText?: string;
  src?: string;
  markdown?: boolean;
  contentProps?: Record<string, any>;
  tabs?: DialogTabConfig[];
}

export interface CustomDialogOptions<
  T extends ContentTextProps | ContentImageProps | ContentComponentProps<any> | ContentStepperProps<any>,
  E extends Record<string, any> = Record<string, never>,
> {
  data: DeepMaybeRef<T>;
  dialogSize?: {
    mobile?: { width?: string; height?: string; maxWidth?: string; maxHeight?: string; aspectRatio?: string };
    desktop?: { width?: string; height?: string; maxWidth?: string; maxHeight?: string; aspectRatio?: string };
  };
  onConfirm?: (data?: any) => void;
  onCancel?: () => void;
  onSettled?: (data?: any) => void;
  events?: {
    [K in keyof E]?: E[K] extends (...args: infer Args) => any ? (...args: Args) => void : never;
  };
}

export interface DialogTemplates extends DynamicDialogTemplates {
  content?: Component;
}

export type DialogRefProps = DeepShallowRef<ContentProps>;

export interface CustomDialogComponent {
  isLoading?: ComputedRef<boolean> | Ref<boolean, boolean>;
  onConfirm?: () => Promise<any>;
  onCancel?: () => Promise<any>;
  resolveGoTo?: () => string | undefined;
}

type DialogType = 'text' | 'image' | 'component' | 'stepper';

interface ResponsiveDialogProps {
  mobile: {
    textDialog: DeepPartial<DialogProps>;
    imageDialog: DeepPartial<DialogProps>;
    componentDialog: DeepPartial<DialogProps>;
    stepperDialog: DeepPartial<DialogProps>;
  };
  desktop: {
    textDialog: DeepPartial<DialogProps>;
    imageDialog: DeepPartial<DialogProps>;
    componentDialog: DeepPartial<DialogProps>;
    stepperDialog: DeepPartial<DialogProps>;
  };
}

const DEFAULT_DIALOG_PROPS: Partial<DialogProps> = {
  modal: true,
  closable: true,
  blockScroll: true,
  draggable: false,
  dismissableMask: true,
  baseZIndex: 1100,
  showHeader: false,
} as const;

const RESPONSE_DIALOG_BASE_MOBILE_PT: DeepPartial<DialogProps> = {
  pt: {
    root: {
      class: 'p-dialog-maximized pt-safe border-none',
    },
  },
} as const;

const RESPONSE_DIALOG_BASE_DESKTOP_PT: DeepPartial<DialogProps> = {
  pt: {
    root: {
      class: 'shadow-xl shadow-black/30 overflow-hidden',
    },
  },
} as const;

const RESPONSIVE_DIALOG_PROPS: ResponsiveDialogProps = {
  mobile: {
    textDialog: {
      style: {
        maxWidth: 'none',
        maxHeight: '100vh',
      },
      ...RESPONSE_DIALOG_BASE_MOBILE_PT,
    },
    imageDialog: {
      style: {
        maxWidth: 'none',
        maxHeight: '100vh',
      },
      ...RESPONSE_DIALOG_BASE_MOBILE_PT,
    },
    componentDialog: {
      style: {
        maxWidth: 'none',
        maxHeight: '100vh',
      },
      ...RESPONSE_DIALOG_BASE_MOBILE_PT,
    },
    stepperDialog: {
      style: {
        maxWidth: 'none',
        maxHeight: '100vh',
      },
      ...RESPONSE_DIALOG_BASE_MOBILE_PT,
    },
  },
  desktop: {
    textDialog: {
      style: {
        maxWidth: '1000px',
        maxHeight: '90vh',
        width: 'auto',
      },
      ...RESPONSE_DIALOG_BASE_DESKTOP_PT,
    },
    imageDialog: {
      style: {
        maxWidth: '1000px',
        maxHeight: '90vh',
        width: '70vw',
      },
      ...RESPONSE_DIALOG_BASE_DESKTOP_PT,
    },
    componentDialog: {
      style: {
        maxWidth: '1000px',
        maxHeight: '90vh',
        width: '70vw',
      },
      ...RESPONSE_DIALOG_BASE_DESKTOP_PT,
    },
    stepperDialog: {
      style: {
        maxWidth: '1000px',
        maxHeight: '90vh',
        width: '70vw',
      },
      ...RESPONSE_DIALOG_BASE_DESKTOP_PT,
    },
  },
} as const;

function dialogService() {
  const open = (content: any, options?: DynamicDialogOptions) => {
    const instance = {
      content: content && markRaw(content),
      options: options || {},
      data: options && options.data,
      close: (params?: any) => {
        DynamicDialogEventBus.emit('close', { instance, params });
      },
    };

    DynamicDialogEventBus.emit('open', { instance });

    return instance;
  };

  return { open };
}

export function useCuiDialog() {
  const dialog = dialogService();

  const { mdBreakpoint } = useSharedCuiBreakpoint();

  const changeProps = (dialogRef: DynamicDialogInstance, props: DeepPartial<DialogProps>, isDraggable?: boolean) => {
    const ref = reactive({ ...dialogRef }) as DynamicDialogInstance;

    if (isDraggable) {
      (props.pt as any).root.class = ((props.pt as any).root.class ? (props.pt as any).root.class + ' ' : '') + 'fixed mt-0';
    }

    mergeWith(ref.options.props, props);
  };

  const setupResponsiveDialog = (dialogRef: DynamicDialogInstance, type: DialogType, isDraggable?: boolean, rest?: CustomDialogOptions<any, any>['dialogSize']) => {
    const customDialog: { mobile?: DeepPartial<DialogProps>; desktop?: DeepPartial<DialogProps> } = {
      mobile: rest?.mobile
        ? {
            style: {
              ...rest.mobile,
            },
            ...RESPONSE_DIALOG_BASE_MOBILE_PT,
          }
        : undefined,
      desktop: rest?.desktop
        ? {
            style: {
              ...rest.desktop,
            },
            ...RESPONSE_DIALOG_BASE_DESKTOP_PT,
          }
        : undefined,
    };

    watch(
      mdBreakpoint,
      (active) => {
        if (active) {
          switch (type) {
            case 'text':
              changeProps(dialogRef, customDialog.mobile ?? RESPONSIVE_DIALOG_PROPS.mobile.textDialog, isDraggable);
              break;
            case 'image':
              changeProps(dialogRef, customDialog.mobile ?? RESPONSIVE_DIALOG_PROPS.mobile.imageDialog, isDraggable);
              break;
            case 'component':
              changeProps(dialogRef, customDialog.mobile ?? RESPONSIVE_DIALOG_PROPS.mobile.componentDialog, isDraggable);
              break;
            case 'stepper':
              changeProps(dialogRef, customDialog.mobile ?? RESPONSIVE_DIALOG_PROPS.mobile.stepperDialog, isDraggable);
              break;
            default:
              break;
          }
        } else {
          switch (type) {
            case 'text':
              changeProps(dialogRef, customDialog.desktop ?? RESPONSIVE_DIALOG_PROPS.desktop.textDialog, isDraggable);
              break;
            case 'image':
              changeProps(dialogRef, customDialog.desktop ?? RESPONSIVE_DIALOG_PROPS.desktop.imageDialog, isDraggable);
              break;
            case 'component':
              changeProps(dialogRef, customDialog.desktop ?? RESPONSIVE_DIALOG_PROPS.desktop.componentDialog, isDraggable);
              break;
            case 'stepper':
              changeProps(dialogRef, customDialog.desktop ?? RESPONSIVE_DIALOG_PROPS.desktop.stepperDialog, isDraggable);
              break;
            default:
              break;
          }
        }
      },
      { immediate: true },
    );

    return dialogRef;
  };

  function createDialog<T extends ContentTextProps | ContentImageProps | ContentComponentProps<any> | ContentStepperProps<any>>(
    type: DialogType,
    options: { component?: Component } & CustomDialogOptions<T>,
    props?: Partial<DynamicDialogOptions['props']>,
  ): DynamicDialogInstance {
    const { component, data, onConfirm, onCancel, onSettled, events, ...rest } = options;

    const templates: DialogTemplates = {
      content: component ? markRaw(component) : undefined,
    };

    if (!props?.pt) {
      props = {
        ...props,
        pt: {
          root: {},
        },
      };
    }

    const isDraggable = unref(data.draggable) ?? false;
    if (isDraggable) {
      props.draggable = true;
    }

    const isDismissableMask = unref(data.dismissableMask);
    if (isDismissableMask !== undefined) {
      props.dismissableMask = isDismissableMask;
    }

    const isModal = unref(data.modal);
    if (isModal !== undefined) {
      props.modal = isModal;
    }

    const rootId = data.rootId ?? randomLetter(10);
    (props.pt as any).root.id = rootId;

    const dialogRef = dialog.open(CuiDialog, {
      data: toRefs(
        reactive({
          confirmText: data.confirmText ?? undefined,
          cancelText: data.cancelText ?? undefined,
          hideConfirmButton: data.hideConfirmButton ?? false,
          hideCancelButton: data.hideCancelButton ?? false,
          loading: data.loading ?? false,
          disabled: data.disabled ?? false,
          confirmButtonProps: data.confirmButtonProps ?? undefined,
          cancelButtonProps: data.cancelButtonProps ?? undefined,
          dialogContentClass: data.dialogContentClass ?? undefined,
          dialogContentStyle: data.dialogContentStyle ?? undefined,
          stayActive: data.stayActive ?? false,
          fullscreen: data.fullscreen ?? false,
          contentText: (data as any).contentText ?? undefined,
          src: (data as any).src ?? undefined,
          markdown: (data as any).markdown ?? false,
          contentProps: (data as any).contentProps ?? undefined,
          tabs: (data as any).tabs ?? undefined,
          rootId,
          ...data,
        }),
      ),
      props,
      templates,
      events,
      onConfirm: onConfirm,
      onCancel: onCancel,
      onClose: (opt) => {
        if (opt?.data?.status === 'confirm') {
          const { status, ...data } = opt.data;
          onConfirm?.(data?.data ?? data);
        } else {
          onCancel?.();
        }

        onSettled?.(opt?.data?.data ?? opt?.data);
      },
    });

    if (data.fullscreen) {
      return dialogRef;
    } else {
      return setupResponsiveDialog(dialogRef, type, isDraggable, rest?.dialogSize);
    }
  }

  function openTextDialog(options: CustomDialogOptions<ContentTextProps>): DynamicDialogInstance {
    const { data, ...rest } = options;

    const dialogProps: DynamicDialogOptions['props'] = structuredClone(DEFAULT_DIALOG_PROPS);

    dialogProps.style = {
      ...DEFAULT_DIALOG_PROPS.style,
      width: 'auto',
      minWidth: '400px',
    };

    if (data.fullscreen) {
      dialogProps.style = {
        ...dialogProps.style,
        maxWidth: 'none',
        maxHeight: '100vh',
      };

      dialogProps.pt = {
        root: {
          class: 'p-dialog-maximized pt-safe border-none',
        },
      };
    }

    return createDialog('text', { data, ...rest }, dialogProps);
  }

  function openImageDialog(options: CustomDialogOptions<ContentImageProps>): DynamicDialogInstance {
    const { data, ...rest } = options;

    const dialogProps: DynamicDialogOptions['props'] = structuredClone(DEFAULT_DIALOG_PROPS);

    if (data.fullscreen) {
      dialogProps.style = {
        ...dialogProps.style,
        maxWidth: 'none',
        maxHeight: '100vh',
      };

      dialogProps.pt = {
        root: {
          class: 'p-dialog-maximized pt-safe border-none',
        },
      };
    }

    return createDialog('image', { data, ...rest }, dialogProps);
  }

  // eslint-disable-next-line space-before-function-paren
  function openComponentDialog<T extends Record<string, any>, E extends Record<string, (...args: any[]) => any> = Record<string, never>>(
    component: Component,
    options: CustomDialogOptions<ContentComponentProps<T>, E>,
  ): DynamicDialogInstance {
    const { data, ...rest } = options;

    const dialogProps: DynamicDialogOptions['props'] = structuredClone(DEFAULT_DIALOG_PROPS);

    if (data.fullscreen) {
      dialogProps.style = {
        ...dialogProps.style,
        maxWidth: 'none',
        maxHeight: '100vh',
      };

      dialogProps.pt = {
        root: {
          class: 'p-dialog-maximized pt-safe border-none',
        },
      };
    }

    return createDialog('component', { component, data, ...rest }, dialogProps);
  }

  // eslint-disable-next-line space-before-function-paren
  function openStepperDialog<T extends Record<string, any>, E extends Record<string, (...args: any[]) => any> = Record<string, never>>(
    component: Component,
    options: CustomDialogOptions<ContentStepperProps<T>, E>,
  ): DynamicDialogInstance {
    const { data, ...rest } = options;

    const dialogProps: DynamicDialogOptions['props'] = structuredClone(DEFAULT_DIALOG_PROPS);

    if (data.fullscreen) {
      dialogProps.style = {
        ...dialogProps.style,
        maxWidth: 'none',
        maxHeight: '100vh',
      };

      dialogProps.pt = {
        root: {
          class: 'p-dialog-maximized pt-safe border-none',
        },
      };
    }

    return createDialog('stepper', { component, data, ...rest }, dialogProps);
  }

  return {
    openTextDialog,
    openImageDialog,
    openComponentDialog,
    openStepperDialog,
  };
}
