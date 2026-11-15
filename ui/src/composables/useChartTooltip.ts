import { hoverActive } from '@/plugins/hover.js';

import type { ChartTooltipAnchor } from '@/components/CuiChartTooltip/types.js';
import type { ActiveDataPoint, ActiveElement, Chart, ChartType } from 'chart.js';

export type ChartTooltipPick = 'column' | 'element';

export function useChartTooltip<T extends ChartType>(chart: () => Chart<T> | null | undefined, pick: ChartTooltipPick) {
  const active = shallowRef<ActiveDataPoint>();
  const anchor = shallowRef<ChartTooltipAnchor>();

  let host: Element | null = null;

  function locate(event: PointerEvent, instance: Chart<T>): ActiveElement | undefined {
    if (pick === 'element') return instance.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)[0];

    const x = event.clientX - instance.canvas.getBoundingClientRect().left;
    const elements = instance.getDatasetMeta(0).data;
    const reach = instance.chartArea.width / elements.length / 2;
    const index = elements.findIndex((element) => Math.abs(element.x - x) <= reach);
    return index < 0 ? undefined : { element: elements[index], datasetIndex: 0, index };
  }

  function anchorOf(instance: Chart<T>, element: ActiveElement['element']): ChartTooltipAnchor {
    const box = instance.canvas.getBoundingClientRect();
    if (pick === 'column') return { x: box.left + element.x, top: box.top, bottom: box.bottom };
    const center = element.tooltipPosition(true);
    const y = box.top + (center.y ?? 0);
    return { x: box.left + (center.x ?? 0), top: y, bottom: y };
  }

  function isActive(target: ActiveDataPoint): boolean {
    return active.value?.index === target.index && active.value.datasetIndex === target.datasetIndex;
  }

  function show(target: ActiveElement, instance: Chart<T>, from: Element): void {
    if (isActive(target)) return;
    if (!active.value) bind();
    host = from;
    active.value = { datasetIndex: target.datasetIndex, index: target.index };
    anchor.value = anchorOf(instance, target.element);
    instance.setActiveElements([active.value]);
    instance.render();
  }

  function hide(): void {
    if (!active.value) return;
    active.value = undefined;
    anchor.value = undefined;
    host = null;
    unbind();
    const instance = chart();
    instance?.setActiveElements([]);
    instance?.render();
  }

  function point(event: PointerEvent, toggle: boolean): void {
    const instance = chart();
    const target = instance && locate(event, instance);
    if (!instance || !target || (toggle && isActive(target))) hide();
    else show(target, instance, event.currentTarget as Element);
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
