let openMenu: (() => void) | null = null;

export function registerOpenMenu(hide: () => void): void {
  if (openMenu && openMenu !== hide) openMenu();
  openMenu = hide;
}

export function releaseOpenMenu(hide: () => void): void {
  if (openMenu === hide) openMenu = null;
}

export function closeOpenMenu(except?: () => void): void {
  if (!openMenu || openMenu === except) return;
  const hide = openMenu;
  openMenu = null;
  hide();
}
