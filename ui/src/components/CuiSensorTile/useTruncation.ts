import type { ShallowRef } from 'vue';

export function useTruncation(container: Readonly<ShallowRef<HTMLElement | null>>, texts: () => unknown) {
  const truncated = ref(false);

  function measure() {
    // a line cut at the side or a clamp cut at the bottom both count
    const children = Array.from(container.value?.children ?? []);
    truncated.value = children.some((child) => child.scrollWidth > child.clientWidth + 1 || child.scrollHeight > child.clientHeight + 1);
  }

  useResizeObserver(container, measure);
  watch(texts, measure, { flush: 'post' });

  return truncated;
}
