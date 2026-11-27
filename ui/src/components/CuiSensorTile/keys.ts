const STEP_SIGNS: Partial<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

export function onExpandKey(event: KeyboardEvent, expand: (event: Event) => void) {
  if (event.target === event.currentTarget) onToggleKey(event, () => expand(event));
}

export function onToggleKey(event: KeyboardEvent, toggle: () => void): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  event.preventDefault();
  toggle();
  return true;
}

export function onStepKey(event: KeyboardEvent, step: (sign: 1 | -1) => void) {
  const sign = STEP_SIGNS[event.key];
  if (sign === undefined) return;
  event.preventDefault();
  step(sign);
}
