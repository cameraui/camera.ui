import { onToggleKey } from './keys.js';
import { useHoldPress } from './useHoldPress.js';

import type { MaybeRefOrGetter } from 'vue';

export interface GuardedPressOptions {
  interactive: () => boolean;
  guarded: () => boolean;
  onGuarded: () => void;
  onTap: () => void;
  onToggle: () => void;
}

const HOLD_MS = 600;
const HINT_MS = 1500;

export function useGuardedPress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, options: GuardedPressOptions) {
  const hint = ref(false);
  const { start: showHint } = useTimeoutFn(() => (hint.value = false), HINT_MS, { immediate: false });

  // what opens to the outside takes a hold, so a stray tap never opens a door
  const { progress, holding } = useHoldPress(target, {
    duration: HOLD_MS,
    holds: () => options.interactive() && options.guarded(),
    onHold: options.onGuarded,
    onTap: () => {
      if (!options.interactive()) return;
      if (!options.guarded()) return options.onTap();
      hint.value = true;
      showHint();
    },
  });

  function onKey(event: KeyboardEvent) {
    if (options.interactive() && event.target === event.currentTarget) onToggleKey(event, options.onToggle);
  }

  return { progress, holding, hint, onKey };
}
