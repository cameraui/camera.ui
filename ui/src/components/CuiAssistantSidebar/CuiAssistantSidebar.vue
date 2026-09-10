<template>
  <nav
    ref="sidebarRef"
    class="cui-assistant-sidebar fixed transition-all duration-200 overflow-hidden md:!pl-0 pl-safe pb-safe flex flex-col z-4"
    :style="{
      width: `${sidebarWidth}px`,
      borderRightWidth: isOpen ? '1px' : '0px',
      paddingBottom: `calc(var(--safe-area-inset-top) + var(--safe-area-inset-bottom) + ${bottombarHeight}px + ${topbarOffset}px)`,
    }"
  >
    <div class="flex h-full min-h-0 flex-col" :style="{ width: `${ASSISTANT_SIDEBAR_WIDTH}px` }">
      <div class="flex items-center gap-2 px-3 pt-3 pb-1">
        <span class="pl-1 text-sm font-semibold text-color">{{ $t('views.assistant.conversations') }}</span>
        <Button
          v-if="collapsible"
          v-tooltip.bottom="{ value: $t('views.assistant.hide_sidebar') }"
          type="button"
          severity="secondary"
          text
          rounded
          class="cui-icon-md ml-auto shrink-0"
          @click="emit('close')"
        >
          <template #icon>
            <i-mdi:dock-left width="100%" height="100%" />
          </template>
        </Button>
      </div>

      <button
        type="button"
        class="cui-assistant-new mx-3 my-2 flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-color"
        @click="emit('create')"
      >
        <i-mdi:plus class="w-4 h-4 text-primary" />
        {{ $t('views.assistant.new_conversation') }}
      </button>

      <IconField class="mx-3 mb-1">
        <InputIcon>
          <i-carbon:search class="w-4 h-4" />
        </InputIcon>
        <InputText v-model="search" :placeholder="$t('views.assistant.search_placeholder')" class="cui-assistant-search w-full text-sm" />
      </IconField>

      <div v-if="loading" class="flex justify-center py-6">
        <ProgressSpinner class="w-[24px] h-[24px] m-0" stroke-width="5" />
      </div>

      <div v-else-if="!groups.length" class="px-4 py-6 text-[13px] text-muted">
        {{ search ? $t('views.assistant.no_matches') : $t('views.assistant.no_conversations') }}
      </div>

      <div v-else class="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
        <template v-for="group in groups" :key="group.key">
          <span class="cui-assistant-group px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-muted">{{ $t(`views.assistant.group_${group.key}`) }}</span>
          <div
            v-for="thread in group.threads"
            :key="thread.id"
            class="cui-assistant-item group relative flex items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13.5px] cursor-pointer select-none"
            :class="{ active: thread.id === activeId }"
            @click="emit('select', thread.id)"
          >
            <span class="min-w-0 flex-1 truncate">{{ thread.title }}</span>
            <Button
              v-tooltip.left="{ value: $t('views.assistant.delete_conversation') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-assistant-item-delete cui-icon-sm shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
              @click.stop="emit('delete', thread.id)"
            >
              <template #icon>
                <i-mdi:delete-outline width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </template>
      </div>

      <div v-if="threads.length" class="cui-assistant-sidebar-foot px-3 py-2">
        <Button type="button" severity="danger" text class="cui-button-small w-full" :label="$t('views.assistant.delete_all_conversations')" @click="emit('deleteAll')" />
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ASSISTANT_SIDEBAR_WIDTH } from './types.js';

import type { AssistantThreadSummary } from '@shared/types';
import type { CuiAssistantSidebarEmits, CuiAssistantSidebarProps } from './types.js';

type GroupKey = 'today' | 'yesterday' | 'week' | 'month' | 'older';

const props = withDefaults(defineProps<CuiAssistantSidebarProps>(), {
  loading: false,
  collapsible: true,
});
const emit = defineEmits<CuiAssistantSidebarEmits>();

const { topbarOffset, bottombarHeight } = useSharedCuiStates();

const sidebarRef = useTemplateRef<HTMLElement>('sidebarRef');
const search = ref('');

const sidebarWidth = computed(() => (props.isOpen ? ASSISTANT_SIDEBAR_WIDTH : 0));

const groups = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const filtered = props.threads.filter((thread) => !needle || thread.title.toLowerCase().includes(needle)).sort((a, b) => b.updatedAt - a.updatedAt);

  const order: GroupKey[] = ['today', 'yesterday', 'week', 'month', 'older'];
  const buckets = new Map<GroupKey, AssistantThreadSummary[]>();
  for (const thread of filtered) {
    const key = groupOf(thread.updatedAt);
    buckets.set(key, [...(buckets.get(key) ?? []), thread]);
  }
  return order.filter((key) => buckets.has(key)).map((key) => ({ key, threads: buckets.get(key)! }));
});

function groupOf(timestamp: number): GroupKey {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(timestamp))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'older';
}

onClickOutside(sidebarRef, (event) => {
  if (!props.isOpen || !props.isOverlay) return;
  const target = event.target as HTMLElement;
  if (target.closest('#assistant-sidebar-toggle')) return;
  emit('close');
});
</script>

<style scoped>
.cui-assistant-sidebar {
  background: var(--subnavbar-background);
  border-right-style: solid;
  border-right-color: var(--border-color);
  height: 100%;
}

.cui-assistant-new {
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  box-shadow: var(--shadow-sm);
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.cui-assistant-new:hover {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 9%, transparent);
}

.cui-assistant-search,
.cui-assistant-search:enabled:hover {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.cui-assistant-search:enabled:hover {
  border-color: var(--border-color-inner);
}

.cui-assistant-search:enabled:focus {
  background: var(--card-background);
  border-color: var(--p-primary-color);
  box-shadow: none;
}

.cui-assistant-item {
  color: var(--text-color-faded);
}

.cui-assistant-item:hover {
  background: var(--subnavbar-item-hover-background);
}

.cui-assistant-item.active {
  background: var(--subnavbar-item-active-background);
  color: var(--text-color);
  font-weight: 500;
}

.cui-assistant-item.active::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 9px;
  bottom: 9px;
  width: 2px;
  border-radius: 2px;
  background: var(--p-primary-color);
}

.cui-assistant-item-delete:hover {
  color: var(--text-danger-color);
}

.cui-assistant-sidebar-foot {
  border-top: 1px solid var(--border-color);
}
</style>
