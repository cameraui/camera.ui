let registered: HTMLElement | null = null;

export function setAppRootElement(el: HTMLElement | null): void {
  registered = el;
}

export function appRootElement(): HTMLElement | null {
  return registered ?? document.getElementById('app');
}
