const MENU_SURFACE = '[data-pc-name="popover"], .cui-bottom-sheet';

const openMenus = new Set<() => void>();

export function registerOpenMenu(hide: () => void): void {
  openMenus.add(hide);
}

export function releaseOpenMenu(hide: () => void): void {
  openMenus.delete(hide);
}

export function closeOpenMenu(except?: () => void, anchor?: unknown): void {
  if (anchor instanceof Element && anchor.closest(MENU_SURFACE)) return;
  for (const hide of openMenus) {
    if (hide === except) continue;
    openMenus.delete(hide);
    hide();
  }
}
