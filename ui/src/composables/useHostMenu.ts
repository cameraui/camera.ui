import { initialCanToggleHostMenu, toggleHostMenu } from '@/common/hostSync.ts';

const canToggle = ref(initialCanToggleHostMenu());

export function setHostMenuState(value: boolean): void {
  canToggle.value = value;
}

export function useHostMenu() {
  return { canToggle: readonly(canToggle), toggle: toggleHostMenu };
}
