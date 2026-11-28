<template>
  <div ref="flowRef" class="home-flow" :class="{ 'home-flow--editing': editing }" :style="{ gap: `${gap}px` }" @pointerdown="press" @touchmove="holdScroll">
    <template v-if="loading">
      <Skeleton v-for="n in SKELETONS" :key="n" class="home-flow__card home-flow__skeleton" width="100%" height="auto" />
    </template>
    <template v-else>
      <div
        v-for="id in order"
        :key="id"
        class="home-flow__card"
        :class="{ 'home-flow__card--lifted': id === lifted, 'home-flow__card--ghost': id === GHOST }"
        :style="id === lifted ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : undefined"
        :data-flow-id="id"
      >
        <div v-if="id !== GHOST" class="home-flow__fill">
          <slot :id />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CuiHomeCameraFlowEmits, CuiHomeCameraFlowProps } from './types.js';

const props = defineProps<CuiHomeCameraFlowProps>();
const emit = defineEmits<CuiHomeCameraFlowEmits>();
defineSlots<{ default(props: { id: string }): unknown }>();

const GHOST = 'flow:ghost';
const SKELETONS = 6;
const HOLD_MS = 350;
const SLOP_PX = 6;
const SLIDE_MS = 200;
const EDGE_PX = 96;
const TAIL_PX = 160;

const flowRef = useTemplateRef<HTMLDivElement>('flowRef');
const local = ref<string[]>();
const lifted = ref<string>();
const shift = reactive({ x: 0, y: 0 });

let pending: { id: string; pointerId: number; x: number; y: number; touch: boolean; timer?: ReturnType<typeof setTimeout> } | undefined;
let grab = { x: 0, y: 0 };
let pointer = { x: 0, y: 0 };
let scrollFrame = 0;
let incoming: string | undefined;

const order = computed(() => local.value ?? props.ids);

function press(event: PointerEvent) {
  if (!props.editing || pending || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>('[data-flow-id]');
  if (!card || target.closest('button, a, input')) return;
  pending = { id: card.dataset.flowId!, pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse' };
  if (pending.touch) pending.timer = setTimeout(lift, HOLD_MS);
  window.addEventListener('pointermove', follow);
  window.addEventListener('pointerup', drop);
  window.addEventListener('pointercancel', cancel);
}

function lift() {
  const card = pending && cardOf(pending.id);
  if (!pending || !card) return;
  const box = card.getBoundingClientRect();
  grab = { x: pending.x - box.left, y: pending.y - box.top };
  pointer = { x: pending.x, y: pending.y };
  local.value = [...props.ids];
  lifted.value = pending.id;
  shift.x = 0;
  shift.y = 0;
  navigator.vibrate?.(10);
}

function follow(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return;
  if (!lifted.value) {
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= SLOP_PX) return;
    if (pending.touch) {
      cancel();
      return;
    }
    lift();
  }
  pointer = { x: event.clientX, y: event.clientY };
  edgeScroll();
}

async function drag() {
  const id = lifted.value;
  if (!id) return;
  await moveTo(id);
  place(id);
}

function drop(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return;
  const id = lifted.value;
  const next = local.value;
  const from = { ...shift };
  stop();
  if (!id || !next) return;
  if (next.join() !== props.ids.join()) emit('reorder', next);
  local.value = undefined;
  nextTick(() => cardOf(id)?.animate([{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' }));
}

function cancel() {
  stop();
  local.value = undefined;
}

function stop() {
  clearTimeout(pending?.timer);
  cancelAnimationFrame(scrollFrame);
  pending = undefined;
  lifted.value = undefined;
  window.removeEventListener('pointermove', follow);
  window.removeEventListener('pointerup', drop);
  window.removeEventListener('pointercancel', cancel);
}

function holdScroll(event: TouchEvent) {
  if (lifted.value && event.cancelable) event.preventDefault();
}

function edgeScroll() {
  cancelAnimationFrame(scrollFrame);
  drag();
  const step = pointer.y < EDGE_PX ? -(EDGE_PX - pointer.y) / 4 : pointer.y > window.innerHeight - EDGE_PX ? (pointer.y - window.innerHeight + EDGE_PX) / 4 : 0;
  if (!lifted.value || !step) return;
  window.scrollBy(0, step);
  scrollFrame = requestAnimationFrame(edgeScroll);
}

async function moveTo(id: string) {
  const current = local.value!;
  const box = flowRef.value?.getBoundingClientRect();
  if (!box) return;
  const x = pointer.x - box.left;
  const y = pointer.y - box.top;
  if (x < 0 || x > box.width || y < 0 || y > box.height + TAIL_PX) {
    if (id === GHOST && current.includes(GHOST)) local.value = current.filter((entry) => entry !== GHOST);
    return;
  }
  const at = slotAt(x, y, current.length);
  if (at === undefined) return;
  const next = current.filter((entry) => entry !== id);
  next.splice(Math.min(at, next.length), 0, id);
  if (next.join() === current.join()) return;
  const before = positions();
  local.value = next;
  await nextTick();
  slide(before, id);
}

function slotAt(x: number, y: number, count: number): number | undefined {
  const cards = Array.from(flowRef.value!.querySelectorAll<HTMLElement>('[data-flow-id]'));
  const hit = cards.findIndex(
    (card) => x >= card.offsetLeft && x <= card.offsetLeft + card.offsetWidth && y >= card.offsetTop && y <= card.offsetTop + card.offsetHeight,
  );
  if (hit >= 0) return hit;
  const last = cards.at(-1);
  const after = !last || y > last.offsetTop + last.offsetHeight || (y >= last.offsetTop && x > last.offsetLeft + last.offsetWidth);
  return after ? count : undefined;
}

function place(id: string) {
  const card = cardOf(id);
  const flow = flowRef.value;
  if (!card || !flow) return;
  const box = flow.getBoundingClientRect();
  shift.x = pointer.x - grab.x - (box.left + card.offsetLeft);
  shift.y = pointer.y - grab.y - (box.top + card.offsetTop);
}

function positions(): Map<string, { x: number; y: number }> {
  const cards = Array.from(flowRef.value?.querySelectorAll<HTMLElement>('[data-flow-id]') ?? []);
  return new Map(cards.map((card) => [card.dataset.flowId!, { x: card.offsetLeft, y: card.offsetTop }]));
}

function slide(before: Map<string, { x: number; y: number }>, moving: string) {
  for (const [id, { x, y }] of before) {
    const card = id === moving ? undefined : cardOf(id);
    if (!card) continue;
    const dx = x - card.offsetLeft;
    const dy = y - card.offsetTop;
    if (dx || dy) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' });
  }
}

function cardOf(id: string): HTMLElement | undefined {
  return flowRef.value?.querySelector<HTMLElement>(`[data-flow-id="${CSS.escape(id)}"]`) ?? undefined;
}

function libraryId(event: Event): string | undefined {
  const row = (event.target as Element | null)?.closest?.<HTMLElement>('.home-drag-in');
  const node = row?.dataset.gsWidget;
  return node ? (JSON.parse(node) as { id: string }).id : undefined;
}

function trackIncoming(event: MouseEvent) {
  pointer = { x: event.clientX, y: event.clientY };
  moveTo(GHOST);
}

async function reveal(id: string) {
  await nextTick();
  cardOf(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

useEventListener(document, 'dragstart', (event: Event) => {
  if (!props.editing || !(event instanceof CustomEvent)) return;
  incoming = libraryId(event);
  if (!incoming) return;
  local.value = [...props.ids];
  window.addEventListener('mousemove', trackIncoming, { capture: true, passive: true });
});

useEventListener(document, 'dragstop', (event: Event) => {
  if (!incoming || !(event instanceof CustomEvent)) return;
  window.removeEventListener('mousemove', trackIncoming, { capture: true });
  const at = local.value?.indexOf(GHOST) ?? -1;
  if (at >= 0) emit('drop', incoming, at);
  incoming = undefined;
  local.value = undefined;
});

onBeforeUnmount(() => {
  stop();
  window.removeEventListener('mousemove', trackIncoming, { capture: true });
});

defineExpose({ reveal });
</script>

<style scoped>
.home-flow {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
}

.home-flow--editing {
  min-height: 10rem;
  -webkit-touch-callout: none;
  user-select: none;
}

.home-flow__card {
  position: relative;
  aspect-ratio: 16 / 9;
  min-width: 0;
}

.home-flow__fill {
  position: absolute;
  inset: 0;
}

.home-flow__skeleton {
  border-radius: 1.5rem;
}

.home-flow__card--lifted {
  z-index: 5;
  filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.35));
}

.home-flow__card--ghost {
  border: 2px dashed color-mix(in srgb, var(--text-color) 25%, transparent);
  border-radius: 1.5rem;
}
</style>
