export function useRegisterSW(_options?: unknown): {
  needRefresh: ReturnType<typeof ref<boolean>>;
  updateServiceWorker: (_reloadPage?: boolean) => Promise<void>;
} {
  return {
    needRefresh: ref(false),
    updateServiceWorker: async () => {},
  };
}
