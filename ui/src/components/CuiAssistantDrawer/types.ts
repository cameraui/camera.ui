import type { DrawerProps } from 'primevue';

export const CUI_ASSISTANT_DRAWER_PROPS: DrawerProps = {
  position: 'right',
  showCloseIcon: false,
  modal: true,
  dismissable: true,
  baseZIndex: 1000,
  blockScroll: true,
  pt: { root: { class: 'w-full sm:w-[460px]' } },
};

export const CUI_ASSISTANT_DRAWER_MINI_PROPS: DrawerProps = {
  position: 'right',
  showCloseIcon: false,
  modal: false,
  dismissable: false,
  baseZIndex: 1000,
  blockScroll: false,
  pt: { root: { class: 'cui-assistant-drawer-mini' } },
};
