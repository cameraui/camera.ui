export interface DialogTabConfig<TabId extends string = string> {
  id: TabId;
  title: string;
}

export type DialogStepperEvents<TabId extends string = string> = {
  tabChange: DialogTabConfig<TabId> | undefined;
  goToMainTab: void;
  registerTab: DialogTabConfig<TabId>;
  updateTabTitle: { tabId: TabId; title: string };
};

export type EventHandler<T> = (payload: T) => void;
export type EventHandlerMap<TabId extends string = string> = {
  [K in keyof DialogStepperEvents<TabId>]?: EventHandler<DialogStepperEvents<TabId>[K]>[];
};

export interface DialogStepperContext<TabId extends string = string> {
  currentTab: Ref<TabId | undefined>;
  tabs: Ref<DialogTabConfig<TabId>[]>;
  isMainTab: Ref<boolean>;

  goToTab: (tabId: TabId) => void;
  goToMainTab: () => void;

  registerTab: (tab: DialogTabConfig<TabId>) => void;
  updateTabConfig: (tabId: TabId, config: Partial<DialogTabConfig<TabId>>) => void;

  on: <K extends keyof DialogStepperEvents<TabId>>(event: K, handler: EventHandler<DialogStepperEvents<TabId>[K]>) => void;
  off: <K extends keyof DialogStepperEvents<TabId>>(event: K, handler: EventHandler<DialogStepperEvents<TabId>[K]>) => void;
  emit: <K extends keyof DialogStepperEvents<TabId>>(event: K, payload?: DialogStepperEvents<TabId>[K]) => void;
}

const DialogStepperSymbol: InjectionKey<DialogStepperContext<any>> = Symbol('DialogStepper');

export function useCuiDialogStepper<TabId extends string>(initialTabs: DialogTabConfig<TabId>[]): DialogStepperContext<TabId> {
  const tabs = ref<DialogTabConfig<TabId>[]>(initialTabs) as Ref<DialogTabConfig<TabId>[]>;
  const currentTab = ref<TabId | undefined>(undefined) as Ref<TabId | undefined>;

  const eventHandlers: EventHandlerMap<TabId> = {};

  const on = <K extends keyof DialogStepperEvents<TabId>>(event: K, handler: EventHandler<DialogStepperEvents<TabId>[K]>) => {
    if (!eventHandlers[event]) {
      eventHandlers[event] = [];
    }
    eventHandlers[event]!.push(handler);
  };

  const off = <K extends keyof DialogStepperEvents<TabId>>(event: K, handler: EventHandler<DialogStepperEvents<TabId>[K]>) => {
    const handlers = eventHandlers[event];
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  };

  const emit = <K extends keyof DialogStepperEvents<TabId>>(event: K, payload?: DialogStepperEvents<TabId>[K]) => {
    const handlers = eventHandlers[event];
    if (handlers) {
      handlers.forEach((handler) => {
        handler(payload as any);
      });
    }
  };

  const isMainTab = computed(() => !currentTab.value);

  const goToTab = (tabId: TabId) => {
    const tab = tabs.value.find((tab) => tab.id === tabId);
    if (tab) {
      currentTab.value = tabId;
      emit('tabChange', tab);
    }
  };

  const goToMainTab = () => {
    currentTab.value = undefined;
    emit('tabChange', undefined);
  };

  const registerTab = (tab: DialogTabConfig<TabId>) => {
    if (!tabs.value.some((t) => t.id === tab.id)) {
      tabs.value.push(tab);
    }
  };

  const updateTabConfig = (tabId: TabId, config: Partial<DialogTabConfig<TabId>>) => {
    const index = tabs.value.findIndex((tab) => tab.id === tabId);
    if (index !== -1) {
      tabs.value[index] = { ...tabs.value[index], ...config };

      if (config.title) {
        emit('updateTabTitle', { tabId, title: config.title });
      }
    }
  };

  const stepperContext: DialogStepperContext<TabId> = {
    currentTab,
    tabs,
    isMainTab,
    goToTab,
    goToMainTab,
    registerTab,
    updateTabConfig,
    on,
    off,
    emit,
  };

  provide(DialogStepperSymbol, stepperContext);

  return stepperContext;
}

export function useCuiDialogStepperContext<TabId extends string = string>(): DialogStepperContext<TabId> {
  const context = inject<DialogStepperContext<TabId>>(DialogStepperSymbol);

  if (!context) {
    throw new Error('useCuiDialogStepperContext must be used within a dialog that uses useCuiDialogStepper');
  }

  return context;
}
