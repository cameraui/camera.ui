const ROTATION_SETTLE_MS = 1000;

let shift = 0;
let heldScroll = 0;
let pinned = false;
let parked: number | undefined;
let settleUntil = 0;
let viewportWidth = 0;
let watching = false;

export function pageScrollY(): number {
  return parked ?? window.scrollY - shift;
}

export function isPageHeld(): boolean {
  return shift !== 0;
}

export function isPageParked(): boolean {
  return parked !== undefined;
}

export function holdPageAt(scroll: number): void {
  parked = undefined;
  // the page returning to this scroll isn't rendered yet, a short document would clamp it
  apply(window.scrollY, scroll, scroll > 0);
}

export function settlePage(scroll = pageScrollY()): void {
  if (parked !== undefined) return;
  apply(pinned ? 0 : scroll, scroll);
}

export function pinPage(): void {
  pinned = true;
  if (parked === undefined) apply(0, pageScrollY());
}

export function unpinPage(): void {
  pinned = false;
  settlePage();
}

export function parkPage(): void {
  if (parked !== undefined) return;
  const scroll = pageScrollY();
  apply(0, 0);
  parked = scroll;
}

export function unparkPage(): void {
  if (parked === undefined) return;
  const scroll = parked;
  parked = undefined;
  settlePage(scroll);
}

export function dropParkedPage(): void {
  parked = undefined;
}

function apply(documentScroll: number, scroll: number, keepHeight = false): void {
  shift = documentScroll - scroll;
  heldScroll = documentScroll;
  if (shift) watchRotation();
  if (shift) document.body.style.marginTop = `${shift}px`;
  else document.body.style.removeProperty('margin-top');
  if (shift || keepHeight) document.documentElement.style.paddingBottom = `${scroll + Math.max(screen.width, screen.height)}px`;
  else document.documentElement.style.removeProperty('padding-bottom');
  document.documentElement.classList.toggle('cui-page-held', shift !== 0);
  if (window.scrollY !== documentScroll) window.scrollTo({ top: documentScroll, behavior: 'instant' });
}

function watchRotation(): void {
  if (watching) return;
  watching = true;
  viewportWidth = window.innerWidth;
  // ios keeps the old center when it rotates and moves the held page, the keyboard only changes the height
  window.addEventListener('resize', () => {
    if (window.innerWidth === viewportWidth) return;
    viewportWidth = window.innerWidth;
    settleUntil = performance.now() + ROTATION_SETTLE_MS;
    restoreHeldScroll();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (performance.now() < settleUntil) restoreHeldScroll();
    },
    { passive: true },
  );
}

function restoreHeldScroll(): void {
  if (shift && window.scrollY !== heldScroll) window.scrollTo({ top: heldScroll, behavior: 'instant' });
}
