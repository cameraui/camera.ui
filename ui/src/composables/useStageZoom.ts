import type { Ref } from 'vue';
import type { ZoomableEvent } from 'vue-zoomable';

export const STAGE_MAX_ZOOM = 5;

const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 50;

export function useStageZoom(container: Ref<HTMLElement | null>, content: Ref<HTMLElement | null>) {
  const zoom = ref(1);
  const pan = ref({ x: 0, y: 0 });
  const constraining = ref(false);

  const containerSize = useElementSize(container);
  const contentSize = useElementSize(content);

  let lastZoom = 1;
  let tapTime = 0;
  let tapPos = { x: 0, y: 0 };
  let touchStart = { x: 0, y: 0 };

  const minimapStyle = computed(() => {
    if (zoom.value <= 1) return null;
    const cw = containerSize.width.value;
    const ch = containerSize.height.value;
    const w = contentSize.width.value * zoom.value;
    const h = contentSize.height.value * zoom.value;
    if (!cw || !ch || !w || !h) return null;
    return {
      width: `${w > cw ? (cw / w) * 100 : 100}%`,
      height: `${h > ch ? (ch / h) * 100 : 100}%`,
      left: `${w > cw ? ((1 - cw / w) / 2) * 100 - (pan.value.x / w) * 100 : 0}%`,
      top: `${h > ch ? ((1 - ch / h) / 2) * 100 - (pan.value.y / h) * 100 : 0}%`,
    };
  });

  const minimapBoxStyle = computed(() => {
    const w = contentSize.width.value;
    const h = contentSize.height.value;
    if (!w || !h) return null;
    return { aspectRatio: `${w} / ${h}` };
  });

  function maxPan(level: number) {
    if (level <= 1) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (contentSize.width.value * level - containerSize.width.value) / 2),
      y: Math.max(0, (contentSize.height.value * level - containerSize.height.value) / 2),
    };
  }

  function constrain(value: { x: number; y: number }, level: number) {
    const max = maxPan(level);
    return {
      x: Math.max(-max.x, Math.min(max.x, value.x)),
      y: Math.max(-max.y, Math.min(max.y, value.y)),
    };
  }

  function onZoomPan(event: ZoomableEvent) {
    if (constraining.value) return;

    // snap to 1 when very close so zoom-out cannot strand at 1.0001
    let clamped = Math.max(1, Math.min(event.zoom, STAGE_MAX_ZOOM));
    if (clamped < 1.02) clamped = 1;
    const wasClamped = Math.abs(event.zoom - clamped) > 0.001;

    if (clamped <= 1) {
      lastZoom = 1;
      if (pan.value.x !== 0 || pan.value.y !== 0 || zoom.value !== 1) {
        constraining.value = true;
        pan.value = { x: 0, y: 0 };
        zoom.value = 1;
        requestAnimationFrame(() => setTimeout(() => (constraining.value = false), 150));
      }
      return;
    }

    const current = { x: event.pan.x, y: event.pan.y };
    if (clamped < lastZoom && lastZoom > 1) {
      // shrink pan proportionally while zooming out, prevents a stale offset
      const scale = (clamped - 1) / (lastZoom - 1);
      current.x = pan.value.x * scale;
      current.y = pan.value.y * scale;
    }
    lastZoom = clamped;

    const constrained = constrain(current, clamped);
    if (wasClamped) {
      // force the constrained values back into VueZoomable to stop a feedback loop
      constraining.value = true;
      zoom.value = clamped;
      pan.value = constrained;
      requestAnimationFrame(() => setTimeout(() => (constraining.value = false), 100));
    } else {
      pan.value = constrained;
    }
  }

  function onDoubleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    constraining.value = true;

    if (zoom.value > 1.01) {
      zoom.value = 1;
      pan.value = { x: 0, y: 0 };
      lastZoom = 1;
    } else if (container.value) {
      const rect = container.value.getBoundingClientRect();
      const offsetX = (rect.width / 2 - (event.clientX - rect.left)) * (STAGE_MAX_ZOOM - 1);
      const offsetY = (rect.height / 2 - (event.clientY - rect.top)) * (STAGE_MAX_ZOOM - 1);
      zoom.value = STAGE_MAX_ZOOM;
      lastZoom = STAGE_MAX_ZOOM;
      pan.value = constrain({ x: offsetX, y: offsetY }, STAGE_MAX_ZOOM);
    }

    setTimeout(() => (constraining.value = false), 200);
  }

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (event.touches.length !== 0 || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 10) return;

    const now = Date.now();
    const dist = Math.hypot(touch.clientX - tapPos.x, touch.clientY - tapPos.y);
    if (now - tapTime < DOUBLE_TAP_DELAY && dist < DOUBLE_TAP_DISTANCE) {
      onDoubleClick({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} } as MouseEvent);
      tapTime = 0;
    } else {
      tapTime = now;
      tapPos = { x: touch.clientX, y: touch.clientY };
    }
  }

  function reset() {
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
    lastZoom = 1;
  }

  return { zoom, pan, constraining, minimapStyle, minimapBoxStyle, onZoomPan, onDoubleClick, onTouchStart, onTouchEnd, reset };
}
