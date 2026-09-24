let shift = 0;
let pinned = false;

export function pageScrollY(): number {
  return window.scrollY - shift;
}

export function isPageHeld(): boolean {
  return shift !== 0;
}

export function holdPageAt(scroll: number): void {
  apply(window.scrollY, scroll);
}

export function settlePage(scroll = pageScrollY()): void {
  apply(pinned ? 0 : scroll, scroll);
}

export function pinPage(): void {
  pinned = true;
  apply(0, pageScrollY());
}

export function unpinPage(): void {
  pinned = false;
  settlePage();
}

function apply(documentScroll: number, scroll: number): void {
  shift = documentScroll - scroll;
  if (shift) document.body.style.marginTop = `${shift}px`;
  else document.body.style.removeProperty('margin-top');
  document.documentElement.classList.toggle('cui-page-held', shift !== 0);
  if (window.scrollY !== documentScroll) window.scrollTo({ top: documentScroll, behavior: 'instant' });
}
