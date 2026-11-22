import { hoverActive } from '@/plugins/hover.js';

import type { ChartTooltipAnchor } from '@/components/CuiChartTooltip/types.js';

export interface PointerTooltipHit<T> {
  target: T;
  anchor: ChartTooltipAnchor;
}

export function usePointerTooltip<T>(
  locate: (event: PointerEvent) => PointerTooltipHit<T> | undefined,
  same: (a: T, b: T) => boolean,
  onChange?: (target: T | undefined) => void,
) {
  const active = shallowRef<T>();
  const anchor = shallowRef<ChartTooltipAnchor>();

  let host: Element | null = null;

  function isActive(target: T): boolean {
    return active.value !== undefined && same(active.value, target);
  }

  function show(hit: PointerTooltipHit<T>, from: Element): void {
    if (isActive(hit.target)) return;
    if (active.value === undefined) bind();
    host = from;
    active.value = hit.target;
    anchor.value = hit.anchor;
    onChange?.(hit.target);
  }

  function hide(): void {
    if (active.value === undefined) return;
    active.value = undefined;
    anchor.value = undefined;
    host = null;
    unbind();
    onChange?.(undefined);
  }

  function point(event: PointerEvent, toggle: boolean): void {
    const hit = locate(event);
    if (!hit || (toggle && isActive(hit.target))) hide();
    else show(hit, event.currentTarget as Element);
  }

  function bind(): void {
    document.addEventListener('pointerdown', onOutsidePointerDown, { capture: true, passive: true });
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }

  function unbind(): void {
    document.removeEventListener('pointerdown', onOutsidePointerDown, { capture: true });
    document.removeEventListener('scroll', onScroll, { capture: true });
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && hoverActive()) point(event, false);
  }

  function onPointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'touch') hide();
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') point(event, true);
  }

  function onOutsidePointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Node && host?.contains(event.target))) hide();
  }

  function onScroll(event: Event): void {
    const scrolled = event.target;
    if (scrolled === document || (scrolled instanceof Node && host && scrolled.contains(host))) hide();
  }

  tryOnScopeDispose(hide);

  return { active, anchor, listeners: { pointermove: onPointerMove, pointerleave: onPointerLeave, pointerup: onPointerUp } };
}
