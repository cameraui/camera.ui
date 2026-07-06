const restarting = ref(false);

let scope: ReturnType<typeof effectScope> | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

export function useServerRestart() {
  if (!scope) {
    scope = effectScope(true);
    scope.run(() => {
      const connection = useConnection();
      watch(connection.bannerMode, (mode) => {
        if (mode !== null && restarting.value) {
          clearTimeout(fallbackTimer);
          restarting.value = false;
        }
      });
    });
  }

  function beginServerRestart(): void {
    restarting.value = true;
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      restarting.value = false;
    }, 15_000);
  }

  return { restarting, beginServerRestart };
}
