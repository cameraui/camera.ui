export function onExpandKey(event: KeyboardEvent, expand: (event: Event) => void) {
  if (event.target === event.currentTarget) onToggleKey(event, () => expand(event));
}

export function onToggleKey(event: KeyboardEvent, toggle: () => void): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  event.preventDefault();
  toggle();
  return true;
}
