import { asyncComponent } from '@/common/asyncComponent.js';

import type { SensorHistoryTarget } from './types.js';

const SensorHistoryDialog = asyncComponent(() => import('./SensorHistory.vue'));

export function useSensorHistoryDialog() {
  const { t } = useI18n();
  const dialog = useCuiDialog();

  return function openSensorHistory({ id, name, type, propertySpecs }: SensorHistoryTarget) {
    dialog.openComponentDialog(SensorHistoryDialog, {
      data: {
        title: `${name} · ${t('views.sensors.history')}`,
        hideConfirmButton: true,
        contentProps: { sensorId: id, sensorType: type, propertySpecs },
      },
      dialogSize: {
        desktop: { width: '720px' },
      },
    });
  };
}
