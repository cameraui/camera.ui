import type { EventPopupCorner, EventPopupDisplay, EventPopupSize, EventPopupSound } from '@/types/electron';

export const EVENT_POPUP_CORNERS: EventPopupCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const EVENT_POPUP_SIZES: EventPopupSize[] = ['small', 'medium', 'large'];
export const EVENT_POPUP_DISPLAYS: EventPopupDisplay[] = ['primary', 'app'];
export const EVENT_POPUP_SOUNDS: EventPopupSound[] = ['off', 'doorbell', 'all'];
export const EVENT_POPUP_MAX_WINDOWS = [1, 2, 3, 4];
export const EVENT_POPUP_PREVIEW_STACK = 5;
