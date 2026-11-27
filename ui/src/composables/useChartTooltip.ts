import type { ChartTooltipAnchor } from '@/components/CuiChartTooltip/types.js';
import type { ActiveDataPoint, ActiveElement, Chart, ChartType } from 'chart.js';

export type ChartTooltipPick = 'column' | 'element';

export function useChartTooltip<T extends ChartType>(chart: () => Chart<T> | null | undefined, pick: ChartTooltipPick) {
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

  return usePointerTooltip<ActiveDataPoint>(
    (event) => {
      const instance = chart();
      if (!instance) return undefined;
      const hit = locate(event, instance);
      return hit && { target: { datasetIndex: hit.datasetIndex, index: hit.index }, anchor: anchorOf(instance, hit.element) };
    },
    (a, b) => a.index === b.index && a.datasetIndex === b.datasetIndex,
    (target) => {
      const instance = chart();
      instance?.setActiveElements(target ? [target] : []);
      instance?.render();
    },
  );
}
