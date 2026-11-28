import type { DBHomePage } from '@shared/types';

export const CAMERAS_PAGE = 'cameras';
export const HOME_PAGE = 'home';

export function isRoomPage(id: string): boolean {
  return id !== CAMERAS_PAGE && id !== HOME_PAGE;
}

export function showsDock(page: DBHomePage): boolean {
  return page.showDock ?? page.id !== CAMERAS_PAGE;
}
