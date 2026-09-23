import type { MaybeRefOrGetter, Ref } from 'vue';

const MAX_ZOOM = 5;

const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 50;

export interface ResizableZoomOptions {
  container: Readonly<Ref<HTMLElement | null>>;
  content: Readonly<Ref<HTMLElement | null>>;
  aspectRatio: MaybeRefOrGetter<string>;
  enabled: MaybeRefOrGetter<boolean>;
  zoom?: Ref<number>;
  pan?: Ref<{ x: number; y: number }>;
  canDoubleTap?: () => boolean;
  onDoubleTap?: (clientX: number, clientY: number) => void;
}

export function useResizableZoom(options: ResizableZoomOptions) {
  const { container, content, aspectRatio, enabled, canDoubleTap = () => true, onDoubleTap } = options;
  const zoom = options.zoom ?? ref(1);
  const pan = options.pan ?? ref({ x: 0, y: 0 });
  const zoomingIn = ref(false);
  const panning = ref(false);
  const resizing = ref(false);

  const { width: containerWidth, height: containerHeight } = useElementSize(container);
  const { width: measuredWidth, height: measuredHeight } = useElementSize(content);
  const { height: windowHeight } = useSharedWindowSize();

  let resizeStartY = 0;
  let resizeStartZoom = 1;
  let panMoved = false;
  let panStartPos = { x: 0, y: 0 };
  let panStartValue = { x: 0, y: 0 };
  let pinching = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  let pinchStartPan = { x: 0, y: 0 };
  let tapTime = 0;
  let tapPos = { x: 0, y: 0 };

  const aspect = computed(() => {
    const [w, h] = toValue(aspectRatio).split('/');
    return { w: parseFloat(w) || 16, h: parseFloat(h) || 9 };
  });

  const baseHeight = computed(() => {
    const width = containerWidth.value;
    if (!width) return 0;
    return Math.min(width * (aspect.value.h / aspect.value.w), windowHeight.value * 0.5);
  });

  const maxHeight = computed(() => windowHeight.value * 0.6);

  const maxZoom = computed(() => {
    if (!baseHeight.value) return MAX_ZOOM;
    return Math.max(1, Math.min(MAX_ZOOM, maxHeight.value / baseHeight.value));
  });

  const baseWidth = computed(() => Math.min(containerWidth.value, baseHeight.value * (aspect.value.w / aspect.value.h)));

  const interacting = computed(() => panning.value || resizing.value);

  const containerStyle = computed(() => {
    if (!toValue(enabled) || !baseHeight.value) return undefined;
    return { height: `${Math.min(baseHeight.value * zoom.value, maxHeight.value)}px` };
  });

  const contentStyle = computed(() => {
    if (!toValue(enabled) || !baseHeight.value) return undefined;
    const style = { width: `${baseWidth.value}px`, height: `${baseHeight.value}px` };
    if (zoom.value <= 1) return style;
    return {
      ...style,
      transform: `scale(${zoom.value}) translate(${pan.value.x / zoom.value}px, ${pan.value.y / zoom.value}px)`,
      transformOrigin: 'center center',
      willChange: 'transform',
    };
  });

  const minimapStyle = computed(() => {
    const level = zoom.value;
    const cw = containerWidth.value;
    const ch = containerHeight.value;
    const width = measuredWidth.value;
    const height = measuredHeight.value;
    if (level <= 1 || !cw || !ch || !width || !height) return null;

    const scaledWidth = width * level;
    const scaledHeight = height * level;
    const canPanX = scaledWidth > cw;
    const canPanY = scaledHeight > ch;
    return {
      width: `${canPanX ? (cw / scaledWidth) * 100 : 100}%`,
      height: `${canPanY ? (ch / scaledHeight) * 100 : 100}%`,
      left: `${canPanX ? ((1 - cw / scaledWidth) / 2) * 100 - (pan.value.x / scaledWidth) * 100 : 0}%`,
      top: `${canPanY ? ((1 - ch / scaledHeight) / 2) * 100 - (pan.value.y / scaledHeight) * 100 : 0}%`,
    };
  });

  // the container only grows on the next frame, so its height for a zoom level comes from the model, not the DOM
  function heightAt(level: number): number {
    return Math.min(baseHeight.value * level, maxHeight.value);
  }

  // limits come from the unscaled picture, so panning never reaches the letterbox
  function constrain(value: { x: number; y: number }, level: number) {
    const width = containerWidth.value;
    if (!width || !baseHeight.value || level <= 1) return { x: 0, y: 0 };
    const maxX = Math.max(0, (measuredWidth.value * level - width) / 2);
    const maxY = Math.max(0, (measuredHeight.value * level - heightAt(level)) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, value.x)),
      y: Math.max(-maxY, Math.min(maxY, value.y)),
    };
  }

  function reset(): void {
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
    zoomingIn.value = false;
  }

  function touchDistance(touches: TouchList): number {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  function touchCenter(touches: TouchList): { x: number; y: number } {
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
  }

  function onTouchStart(event: TouchEvent): void {
    if (!toValue(enabled)) return;
    panMoved = false;

    if (event.touches.length === 2) {
      panning.value = false;
      pinching = true;
      pinchStartDistance = touchDistance(event.touches);
      pinchStartZoom = zoom.value;
      pinchStartPan = { ...pan.value };
      return;
    }

    if (event.touches.length === 1 && zoom.value > 1) {
      panning.value = true;
      panStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      panStartValue = { ...pan.value };
    }
  }

  function onTouchMove(event: TouchEvent): void {
    if (!toValue(enabled)) return;

    if (pinching && event.touches.length === 2) {
      event.preventDefault();
      const next = Math.max(1, Math.min(maxZoom.value, pinchStartZoom * (touchDistance(event.touches) / pinchStartDistance)));
      if (next > zoom.value) zoomingIn.value = true;

      const rect = container.value?.getBoundingClientRect();
      if (rect) {
        const center = touchCenter(event.touches);
        const offsetX = center.x - (rect.left + rect.width / 2);
        const offsetY = center.y - (rect.top + heightAt(zoom.value) / 2);
        const ratio = next / pinchStartZoom;
        zoom.value = next;
        pan.value = constrain({ x: pinchStartPan.x - offsetX * (ratio - 1), y: pinchStartPan.y - offsetY * (ratio - 1) }, next);
      } else {
        zoom.value = next;
      }
      return;
    }

    if (panning.value && event.touches.length === 1) {
      const deltaX = event.touches[0].clientX - panStartPos.x;
      const deltaY = event.touches[0].clientY - panStartPos.y;
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) panMoved = true;
      pan.value = constrain({ x: panStartValue.x + deltaX, y: panStartValue.y + deltaY }, zoom.value);
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    if (event.touches.length === 1 && pinching) {
      pinching = false;
      zoomingIn.value = false;
      if (zoom.value > 1) {
        panning.value = true;
        panMoved = false;
        panStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        panStartValue = { ...pan.value };
      }
      return;
    }

    if (event.touches.length === 0 && event.changedTouches.length === 1 && !panMoved && !pinching) {
      const touch = event.changedTouches[0];
      const now = Date.now();
      const dist = Math.hypot(touch.clientX - tapPos.x, touch.clientY - tapPos.y);
      if (now - tapTime < DOUBLE_TAP_DELAY && dist < DOUBLE_TAP_DISTANCE) {
        if (onDoubleTap) onDoubleTap(touch.clientX, touch.clientY);
        else if (toValue(enabled) && canDoubleTap()) toggleAt(touch.clientX);
        tapTime = 0;
        tapPos = { x: 0, y: 0 };
      } else {
        tapTime = now;
        tapPos = { x: touch.clientX, y: touch.clientY };
      }
    }

    panning.value = false;
    panMoved = false;
    pinching = false;
    zoomingIn.value = false;
  }

  function onDoubleClick(event: MouseEvent): void {
    if (!toValue(enabled) || !canDoubleTap()) return;
    event.preventDefault();
    event.stopPropagation();
    toggleAt(event.clientX);
  }

  function toggleAt(clientX: number): void {
    if (zoom.value > 1.01) {
      reset();
      return;
    }
    const rect = container.value?.getBoundingClientRect();
    if (!rect) return;

    const level = maxZoom.value;
    const maxPanX = Math.max(0, (rect.width * level - rect.width) / 2);
    const offsetX = (rect.width / 2 - (clientX - rect.left)) * (level - 1);
    zoomingIn.value = true;
    zoom.value = level;
    pan.value = { x: Math.max(-maxPanX, Math.min(maxPanX, offsetX)), y: 0 };
    setTimeout(() => (zoomingIn.value = false), 200);
  }

  function onMouseDown(event: MouseEvent): void {
    if (!toValue(enabled) || zoom.value <= 1) return;
    stopMousePan();
    panning.value = true;
    panStartPos = { x: event.clientX, y: event.clientY };
    panStartValue = { ...pan.value };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopMousePan);
  }

  function onMouseMove(event: MouseEvent): void {
    if (!panning.value) return;
    pan.value = constrain({ x: panStartValue.x + event.clientX - panStartPos.x, y: panStartValue.y + event.clientY - panStartPos.y }, zoom.value);
  }

  function stopMousePan(): void {
    panning.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopMousePan);
  }

  function onWheel(event: WheelEvent): void {
    if (!toValue(enabled)) return;
    event.preventDefault();
    let next = Math.max(1, Math.min(maxZoom.value, zoom.value - event.deltaY * 0.002));
    if (next < 1.02) next = 1;
    if (next === zoom.value) return;

    const previous = zoom.value;
    if (next <= 1) {
      reset();
    } else if (next < previous && previous > 1) {
      // shrink pan with the zoom so no stale offset is left
      const scale = (next - 1) / (previous - 1);
      zoom.value = next;
      pan.value = constrain({ x: pan.value.x * scale, y: pan.value.y * scale }, next);
    } else {
      zoom.value = next;
    }
  }

  function onResizeStart(event: MouseEvent): void {
    if (!toValue(enabled)) return;
    resizing.value = true;
    resizeStartY = event.clientY;
    resizeStartZoom = zoom.value;
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', stopResize);
  }

  function onResizeTouchStart(event: TouchEvent): void {
    if (!toValue(enabled)) return;
    resizing.value = true;
    resizeStartY = event.touches[0].clientY;
    resizeStartZoom = zoom.value;
    document.addEventListener('touchmove', onResizeTouchMove, { passive: false });
    document.addEventListener('touchend', stopResize);
  }

  function resizeTo(clientY: number): void {
    if (!baseHeight.value) return;
    zoom.value = Math.max(1, Math.min(maxZoom.value, resizeStartZoom + (clientY - resizeStartY) / baseHeight.value));
    pan.value = constrain(pan.value, zoom.value);
  }

  function onResizeMove(event: MouseEvent): void {
    if (resizing.value) resizeTo(event.clientY);
  }

  function onResizeTouchMove(event: TouchEvent): void {
    if (!resizing.value) return;
    event.preventDefault();
    resizeTo(event.touches[0].clientY);
  }

  function stopResize(): void {
    resizing.value = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', onResizeTouchMove);
    document.removeEventListener('touchend', stopResize);
  }

  watch(
    () => toValue(enabled),
    () => {
      stopMousePan();
      stopResize();
      pinching = false;
      reset();
    },
  );

  useEventListener(window, 'blur', () => {
    stopMousePan();
    stopResize();
  });

  tryOnScopeDispose(() => {
    stopMousePan();
    stopResize();
  });

  return {
    zoom,
    pan,
    zoomingIn,
    interacting,
    maxZoom,
    containerStyle,
    contentStyle,
    minimapStyle,
    reset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onDoubleClick,
    onMouseDown,
    onWheel,
    onResizeStart,
    onResizeTouchStart,
  };
}
