import { sensorMeta } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertyLabelKey, sensorPropertySpec } from '@/common/sensorDisplay.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { TileOption, TileToggle } from './types.js';

export function useSensorSettings(sensor: () => ReactiveSensor<object>) {
  const { t, te } = useI18n();
  const toast = useCuiToast();

  const toggles = computed<TileToggle[]>(() =>
    (sensorMeta(sensor().type)?.semantics?.toggles ?? [])
      .filter((property) => sensorOffers(sensor(), property))
      .map((property) => ({ property, label: propertyLabel(property), value: sensor().getProperty(property) === true })),
  );
  // a switch that is on, such as away or auto, belongs in the state, a setting like a child lock does not
  const flags = computed(() => {
    const configuration = sensorMeta(sensor().type)?.semantics?.configuration ?? [];
    return toggles.value
      .filter((toggle) => toggle.value && !configuration.includes(toggle.property))
      .map((toggle) => (te(`components.sensor_state.${toggle.property}`) ? t(`components.sensor_state.${toggle.property}`) : toggle.label));
  });

  function propertyLabel(property: string): string {
    return t(`components.automation_nodes.${sensorPropertyLabelKey(sensor().type, property)}`);
  }

  function choices(property: string): TileOption[] {
    if (!sensorOffers(sensor(), property)) return [];
    return (sensorPropertySpec(sensor(), property)?.choices ?? []).map(({ label, value }) => ({ label, value: String(value) }));
  }

  function reading(property: string | undefined): number | undefined {
    const value = property && sensorOffers(sensor(), property) ? sensor().getProperty(property) : undefined;
    return typeof value === 'number' ? value : undefined;
  }

  function send(property: string, value: unknown) {
    sensor()
      .setProperty(property, value)
      .catch((error) => toast.add({ severity: 'error', detail: error, life: 3000 }));
  }

  return { toggles, flags, propertyLabel, choices, reading, send };
}
