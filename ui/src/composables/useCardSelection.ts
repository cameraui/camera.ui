export function useCardSelection<T>(items: MaybeRefOrGetter<T[]>, getId: (item: T) => string) {
  const selectionMode = ref(false);
  const selectedIds = ref(new Set<string>());
  const bulkBusy = ref(false);

  const selectedItems = computed(() => toValue(items).filter((item) => selectedIds.value.has(getId(item))));
  const allSelected = computed(() => {
    const list = toValue(items);
    return list.length > 0 && list.every((item) => selectedIds.value.has(getId(item)));
  });

  function enterSelectionMode() {
    selectionMode.value = true;
  }

  function exitSelectionMode() {
    selectionMode.value = false;
    selectedIds.value = new Set();
  }

  function toggleSelectAll() {
    selectedIds.value = allSelected.value ? new Set() : new Set(toValue(items).map(getId));
  }

  function toggleSelection(id: string) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds.value = next;
  }

  return {
    selectionMode,
    selectedIds,
    selectedItems,
    allSelected,
    bulkBusy,
    enterSelectionMode,
    exitSelectionMode,
    toggleSelectAll,
    toggleSelection,
  };
}
