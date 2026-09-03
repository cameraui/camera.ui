import { initialCanToggleHostMenu, toggleHostMenu } from '@/common/hostSync.ts';

const canToggle = ref(initialCanToggleHostMenu());
const badge = ref(0);

export function setHostMenuState(value: boolean): void {
  canToggle.value = value;
}

export function setHostMenuBadge(count: number): void {
  badge.value = count;
}

export function useHostMenu() {
  return { canToggle: readonly(canToggle), badge: readonly(badge), toggle: toggleHostMenu };
}
