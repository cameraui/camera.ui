import { usePrimeVue } from 'primevue';

import type { CuiTimelineLocale } from '@camera.ui/nvr';
import type { ComputedRef } from 'vue';

export function useTimelineLocale(): ComputedRef<CuiTimelineLocale> {
  const { locale } = useI18n();
  const primevue = usePrimeVue();

  return computed(() => ({
    locale: locale.value,
    dayNames: primevue.config.locale?.dayNames,
    dayNamesShort: primevue.config.locale?.dayNamesShort,
    monthNames: primevue.config.locale?.monthNames,
    monthNamesShort: primevue.config.locale?.monthNamesShort,
  }));
}
