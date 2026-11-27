import { ContactKind, ContactProperty, LockProperty, LockState, SensorType } from '@camera.ui/sdk';

import { SensorsQuery } from '@/api/routes/sensors.js';
import { sensorToneColor } from '@/common/sensorDisplay.js';

import { useGroupSend } from './groupControl.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export type HomeLockVariant = 'key' | 'chip' | 'row';

export interface CuiHomeLockItemProps {
  sensor: ReactiveSensor;
  variant: HomeLockVariant;
  door?: ReactiveSensor;
  narrow?: boolean;
  disabled: boolean;
}

export interface CuiHomeLockItemEmits {
  (e: 'hint', shown: boolean): void;
  (e: 'note', text: string | undefined): void;
}

const DOOR_WORDS: Record<ContactKind, string> = {
  [ContactKind.Door]: 'door',
  [ContactKind.Window]: 'window',
  [ContactKind.GarageDoor]: 'gate',
};

export function useLockGroup(sensors: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();
  const { data: sensorList } = new SensorsQuery().getSensorsQuery();

  const locks = computed(() => sensors().filter((sensor) => sensor.type === SensorType.Lock));
  const contacts = computed(() => sensors().filter((sensor) => sensor.type === SensorType.Contact));
  const doors = computed(() => pairDoors(locks.value, contacts.value, new Map((sensorList.value ?? []).map((sensor) => [sensor.id, sensor.device?.id]))));
  const loose = computed(() => {
    const paired = new Set([...doors.value.values()]);
    return contacts.value.filter((contact) => !paired.has(contact));
  });
  const online = computed(() => locks.value.filter((lock) => lock.online.value));
  const unlocked = computed(() => online.value.filter((lock) => lock.getProperty(LockProperty.CurrentState) !== LockState.Secured));
  const allLocked = computed(() => online.value.length > 0 && !unlocked.value.length);
  const color = sensorToneColor(SensorType.Lock, true);

  const stateText = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (allLocked.value) return t('views.home_dashboard.groups.locks.all_locked');
    return t('views.home_dashboard.groups.locks.unlocked', { count: unlocked.value.length });
  });

  function lockAll() {
    send(unlocked.value, (lock) => lock.setProperty(LockProperty.TargetState, LockState.Secured));
  }

  return { locks, doors, loose, unlocked, allLocked, color, stateText, lockAll };
}

export function doorText(contact: ReactiveSensor, t: (key: string) => string): string | undefined {
  if (!contact.online.value) return undefined;
  const kind = contact.getProperty<ContactKind>(ContactProperty.Kind) ?? ContactKind.Door;
  const open = contact.getProperty(ContactProperty.Detected) === true;
  return t(`views.home_dashboard.groups.locks.${DOOR_WORDS[kind] ?? 'door'}_${open ? 'open' : 'closed'}`);
}

function pairDoors(locks: ReactiveSensor[], contacts: ReactiveSensor[], devices: Map<string, string | undefined>): Map<string, ReactiveSensor> {
  // a door contact belongs to the lock of its device, or to the only lock when the group holds one of each
  const pairs = new Map<string, ReactiveSensor>();
  for (const lock of locks) {
    const device = devices.get(lock.id);
    const contact = device ? contacts.find((candidate) => devices.get(candidate.id) === device) : undefined;
    if (contact) pairs.set(lock.id, contact);
  }
  if (!pairs.size && locks.length === 1 && contacts.length === 1) pairs.set(locks[0].id, contacts[0]);
  return pairs;
}
