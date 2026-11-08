import type { MaybeRefOrGetter } from 'vue';

const openDialogs = reactive(new Map<string, number>());

export function useInstallProgressDialog(target: MaybeRefOrGetter<string | undefined>): void {
  watchEffect((onCleanup) => {
    const name = toValue(target);
    if (!name) return;

    openDialogs.set(name, (openDialogs.get(name) ?? 0) + 1);
    onCleanup(() => {
      const count = (openDialogs.get(name) ?? 1) - 1;
      if (count > 0) openDialogs.set(name, count);
      else openDialogs.delete(name);
    });
  });
}

export function isInstallProgressShown(name: string): boolean {
  return openDialogs.has(name);
}
