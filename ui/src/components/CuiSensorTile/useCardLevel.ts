import { onStepKey, onToggleKey } from './keys.js';
import { clampRatio } from './range.js';
import { usePointerDrag } from './usePointerDrag.js';

import type { MaybeRefOrGetter } from 'vue';

export interface CardLevelOptions {
  interactive: () => boolean;
  draggable: () => boolean;
  ratio: () => number;
  keyStep: () => number;
  onInput: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onToggle: () => void;
}

export function useCardLevel(card: MaybeRefOrGetter<HTMLElement | null | undefined>, options: CardLevelOptions) {
  let start = 0;
  let width = 1;
  let last = 0;

  const { dragging } = usePointerDrag(card, {
    axis: 'x',
    draggable: () => options.interactive() && options.draggable(),
    onStart: () => {
      start = options.ratio();
      width = toValue(card)?.getBoundingClientRect().width || 1;
    },
    onMove: (_event, delta) => {
      last = clampRatio(start + delta.x / width);
      options.onInput(last);
    },
    onEnd: () => options.onCommit(last),
    onTap: () => {
      if (options.interactive()) options.onToggle();
    },
  });

  function onKey(event: KeyboardEvent) {
    if (!options.interactive() || event.target !== event.currentTarget || onToggleKey(event, options.onToggle)) return;
    if (options.draggable()) onStepKey(event, (sign) => options.onCommit(clampRatio(options.ratio() + sign * options.keyStep())));
  }

  return { dragging, onKey };
}
