import type { ReactiveSensor } from '@camera.ui/browser';
import type { InjectionKey, MaybeRefOrGetter } from 'vue';
import type CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';

export interface CuiHomeMemberIconProps {
  sensor?: ReactiveSensor;
  label?: string;
}

export const HOME_MEMBER_OPEN: InjectionKey<(sensor: ReactiveSensor, event: Event) => void> = Symbol('home-member-open');

export function useMemberSheet(sheet: MaybeRefOrGetter<InstanceType<typeof CuiSensorTileSheet> | null | undefined>) {
  const sheetSensor = shallowRef<ReactiveSensor>();

  async function openMember(sensor: ReactiveSensor, event: Event) {
    const target = event.currentTarget;
    sheetSensor.value = sensor;
    await nextTick();
    toValue(sheet)?.open(event, target);
  }

  provide(HOME_MEMBER_OPEN, openMember);

  return { sheetSensor, openMember };
}
