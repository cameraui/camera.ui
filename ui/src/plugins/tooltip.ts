import type { DirectiveBinding, ObjectDirective } from 'vue';

export type TooltipValue = string | { value?: string; disabled?: boolean; class?: string; pt?: { root?: { class?: string } } } | null | undefined;

type Position = 'top' | 'bottom' | 'left' | 'right';

interface TooltipState {
  target: HTMLElement;
  text: string;
  disabled: boolean;
  className: string;
  position: Position;
}

interface TooltipElements {
  root: HTMLDivElement;
  arrow: HTMLDivElement;
  text: HTMLDivElement;
}

const POSITIONS: Position[] = ['top', 'bottom', 'left', 'right'];

const FALLBACKS: Record<Position, Position[]> = {
  top: ['top', 'bottom'],
  bottom: ['bottom', 'top'],
  left: ['left', 'right', 'top', 'bottom'],
  right: ['right', 'left', 'top', 'bottom'],
};

const FADE_IN_MS = 250;

const INTERACTIVE =
  'a[href], button, input, select, textarea, label, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]';

const states = new WeakMap<Element, TooltipState>();

let elements: TooltipElements | null = null;
let active: TooltipState | null = null;
let container: Element | null = null;
let renderedClass = '';
let lastPointerType = '';

export const tooltip: ObjectDirective<HTMLElement, TooltipValue> = {
  mounted(el, binding) {
    const target = el.classList.contains('p-inputwrapper') ? (el.querySelector('input') ?? el) : el;
    const state: TooltipState = { target, text: '', disabled: false, className: '', position: 'right' };
    applyBinding(state, binding);
    states.set(el, state);
    states.set(target, state);

    if (binding.modifiers.focus) {
      target.addEventListener('focus', onShowEvent);
      target.addEventListener('blur', onHideEvent);
    } else {
      target.addEventListener('pointerenter', onPointerEnter);
      target.addEventListener('pointerleave', onPointerLeave);
      target.addEventListener('click', onClick);
    }
    target.addEventListener('keydown', onKeydown);
    // the same listener with the same options is added only once
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  },
  updated(el, binding) {
    const state = states.get(el);
    if (!state) return;
    applyBinding(state, binding);
    if (state !== active || !elements) return;
    if (state.disabled || !state.text) hide();
    else if (elements.text.textContent !== state.text || renderedClass !== state.className) render(state, elements);
  },
  beforeUnmount(el) {
    const state = states.get(el);
    if (!state) return;
    if (state === active) hide();
    const { target } = state;
    target.removeEventListener('focus', onShowEvent);
    target.removeEventListener('blur', onHideEvent);
    target.removeEventListener('pointerenter', onPointerEnter);
    target.removeEventListener('pointerleave', onPointerLeave);
    target.removeEventListener('click', onClick);
    target.removeEventListener('keydown', onKeydown);
    states.delete(el);
    states.delete(target);
  },
};

export function setTooltipContainer(el: Element): void {
  container = el;
}

function applyBinding(state: TooltipState, binding: DirectiveBinding<TooltipValue>): void {
  const value = binding.value;
  state.position = POSITIONS.find((position) => binding.modifiers[position]) ?? 'right';
  if (typeof value === 'string') {
    state.text = value;
    state.disabled = false;
    state.className = '';
    return;
  }
  state.text = value?.value?.trim() ? value.value : '';
  state.disabled = value?.disabled === true;
  state.className = [value?.class, value?.pt?.root?.class].filter(Boolean).join(' ');
}

function onShowEvent(event: Event): void {
  const state = states.get(event.currentTarget as Element);
  if (state) show(state);
}

function onHideEvent(event: Event): void {
  if (states.get(event.currentTarget as Element) === active) hide();
}

function onPointerEnter(event: PointerEvent): void {
  if (event.pointerType !== 'touch') onShowEvent(event);
}

function onPointerLeave(event: PointerEvent): void {
  if (event.pointerType !== 'touch') onHideEvent(event);
}

function onClick(event: MouseEvent): void {
  const state = states.get(event.currentTarget as Element);
  if (!state) return;
  if (state === active) hide();
  else if (lastPointerType === 'touch' && !state.target.closest(INTERACTIVE)) show(state);
}

function onPointerDown(event: PointerEvent): void {
  lastPointerType = event.pointerType;
  if (active && !(event.target instanceof Node && active.target.contains(event.target))) hide();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.code === 'Escape') onHideEvent(event);
}

function onWindowResize(): void {
  if (!isTouchDevice()) hide();
}

function onScroll(event: Event): void {
  const scrolled = event.target;
  if (active && (scrolled === document || (scrolled instanceof Node && scrolled.contains(active.target)))) hide();
}

function show(state: TooltipState): void {
  if (state.disabled || !state.text || !state.target.isConnected) return;
  elements ??= createElements();
  render(state, elements);
  if (!active) {
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }
  active = state;
  elements.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS });
}

function hide(): void {
  if (!active) return;
  active = null;
  elements?.root.remove();
  window.removeEventListener('resize', onWindowResize);
  document.removeEventListener('scroll', onScroll, { capture: true });
}

function createElements(): TooltipElements {
  const root = document.createElement('div');
  const arrow = document.createElement('div');
  const text = document.createElement('div');
  root.setAttribute('role', 'tooltip');
  root.style.cssText = 'display:inline-block;width:fit-content;pointer-events:none;position:fixed';
  arrow.className = 'p-tooltip-arrow';
  text.className = 'p-tooltip-text';
  root.append(arrow, text);
  return { root, arrow, text };
}

function render(state: TooltipState, { root, arrow, text }: TooltipElements): void {
  text.textContent = state.text;
  root.className = state.className ? `p-tooltip p-component ${state.className}` : 'p-tooltip p-component';
  renderedClass = state.className;
  const parent = container ?? document.body;
  if (root.parentElement !== parent) parent.append(root);

  const host = state.target.getBoundingClientRect();
  const fits = FALLBACKS[state.position].some((position) => {
    place(position, host, root, arrow);
    return !isOutOfBounds(root);
  });
  if (!fits) place(state.position, host, root, arrow);
}

function place(position: Position, host: DOMRect, root: HTMLDivElement, arrow: HTMLDivElement): void {
  root.style.left = '-999px';
  root.style.top = '-999px';
  root.classList.remove('p-tooltip-top', 'p-tooltip-bottom', 'p-tooltip-left', 'p-tooltip-right');
  root.classList.add(`p-tooltip-${position}`);

  const width = root.offsetWidth;
  const height = root.offsetHeight;
  if (position === 'left' || position === 'right') {
    root.style.left = `${position === 'right' ? host.right : host.left - width}px`;
    root.style.top = `${host.top + (host.height - height) / 2}px`;
    setArrow(arrow, '50%', position === 'left' ? '0' : '', '', position === 'right' ? '0' : '');
    return;
  }

  let left = host.left + (host.width - width) / 2;
  if (left < 0) left = 0;
  else if (left + width > window.innerWidth) left = Math.floor(host.right - width);
  root.style.left = `${left}px`;
  root.style.top = `${position === 'top' ? host.top - height : host.bottom}px`;
  setArrow(arrow, position === 'bottom' ? '0' : '', '', position === 'top' ? '0' : '', `${host.left - left + host.width / 2}px`);
}

function setArrow(arrow: HTMLDivElement, top: string, right: string, bottom: string, left: string): void {
  arrow.style.top = top;
  arrow.style.right = right;
  arrow.style.bottom = bottom;
  arrow.style.left = left;
}

function isOutOfBounds(root: HTMLDivElement): boolean {
  const rect = root.getBoundingClientRect();
  return rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight;
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
