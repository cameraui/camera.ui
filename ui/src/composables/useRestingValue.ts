import { useDebounceFn } from '@vueuse/core';

import type { Ref, WritableComputedRef } from 'vue';

export function useRestingValue(current: Readonly<Ref<number>>, send: (value: number) => void, delay = 500): WritableComputedRef<number> {
  const local = ref<number>();

  const sendResting = useDebounceFn((value: number) => {
    send(value);
    local.value = undefined;
  }, delay);

  return computed({
    get: () => local.value ?? current.value,
    set: (value: number) => {
      local.value = value;
      sendResting(value);
    },
  });
}
