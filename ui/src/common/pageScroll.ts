let shift = 0;
let pinned = false;
let parked: number | undefined;

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
  apply(window.scrollY, scroll);
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

function apply(documentScroll: number, scroll: number): void {
  shift = documentScroll - scroll;
  if (shift) document.body.style.marginTop = `${shift}px`;
  else document.body.style.removeProperty('margin-top');
  document.documentElement.classList.toggle('cui-page-held', shift !== 0);
  if (window.scrollY !== documentScroll) window.scrollTo({ top: documentScroll, behavior: 'instant' });
}
