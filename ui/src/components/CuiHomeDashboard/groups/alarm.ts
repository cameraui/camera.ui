import { ContactProperty, SecuritySystemProperty, SecuritySystemState, sensorMeta, SensorType, SirenProperty } from '@camera.ui/sdk';
import SoundIcon from '~icons/mdi/bullhorn-outline';
import SilenceIcon from '~icons/mdi/volume-off';
import WindowClosedIcon from '~icons/mdi/window-closed';
import WindowOpenIcon from '~icons/mdi/window-open';

import { securityColor, sensorIcon, sensorPropertySpec, sensorStatus, sensorTypeIcon, toneColor } from '@/common/sensorDisplay.js';
import { shortMoment } from '@/components/CuiSensorTile/useSensorHistory.js';

import { useGroupSend } from './groupControl.js';
import { detectorColor, names, useSafetyGroup } from './safety.js';
import { useSince } from './since.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

export interface HomeAlarmAction {
  icon: Component;
  label: string;
  ariaLabel: string;
  guarded: boolean;
  ready: boolean;
  press: () => void;
}

export interface HomeAlarmRow {
  key: string;
  sensor?: ReactiveSensor;
  icon: Component;
  name: string;
  state: string;
  on: boolean;
  color: string;
  offline?: boolean;
  action?: HomeAlarmAction;
}

export interface CuiHomeAlarmRowProps {
  row: HomeAlarmRow;
  narrow: boolean;
  interactive: boolean;
}

export interface CuiHomeAlarmRowEmits {
  (e: 'hint', shown: boolean): void;
}

const STATES = sensorMeta(SensorType.SecuritySystem)!.semantics!.states!;

export function useAlarmGroup(sensors: () => ReactiveSensor[]) {
  const { t, locale } = useI18n();
  const { send } = useGroupSend();
  const { detectors, hits, sirens, sounding, alarmText, silence } = useSafetyGroup(sensors);

  const systems = computed(() => sensors().filter((sensor) => sensor.type === SensorType.SecuritySystem));
  const contacts = computed(() => sensors().filter((sensor) => sensor.type === SensorType.Contact));
  const panel = computed<ReactiveSensor | undefined>(() => systems.value[0]);
  const ready = computed(() => systems.value.filter(online));
  const since = useSince(() => systems.value, { property: () => SecuritySystemProperty.CurrentState });

  const current = computed(() => panel.value?.getProperty<number>(SecuritySystemProperty.CurrentState));
  const mode = computed(() => panel.value?.getProperty<number>(SecuritySystemProperty.TargetState) ?? current.value);
  const alarmed = computed(() => ready.value.find((system) => system.getProperty(SecuritySystemProperty.CurrentState) === SecuritySystemState.AlarmTriggered));
  const armed = computed(() => mode.value !== undefined && mode.value !== SecuritySystemState.Disarmed);
  const pending = computed(() => !alarmed.value && current.value !== undefined && current.value !== mode.value);
  const armModes = computed(() =>
    panel.value
      ? Object.values(sensorPropertySpec(panel.value, SecuritySystemProperty.TargetState)?.values ?? {})
          .map(Number)
          .filter((value) => value !== SecuritySystemState.Disarmed)
      : [],
  );
  const opened = computed(() => contacts.value.filter((contact) => online(contact) && contact.getProperty(ContactProperty.Detected) === true));
  const color = computed(() => {
    if (!panel.value || alarmed.value) return toneColor('alarm');
    return securityColor(mode.value) ?? toneColor('ok');
  });
  const cause = computed(() => [...hits.value, ...opened.value][0]?.displayName.value);

  const openText = computed(() =>
    opened.value.length ? t('views.home_dashboard.groups.alarm.open', { names: names(opened.value) }) : t('views.home_dashboard.groups.alarm.all_closed'),
  );
  const sinceText = computed(() => {
    const at = panel.value && since.get(panel.value.id);
    if (!at || mode.value === undefined) return modeLabel(mode.value);
    return t('views.home_dashboard.groups.alarm.since', { mode: modeLabel(mode.value), time: shortMoment(at, Date.now(), locale.value) });
  });
  const sirenText = computed(() =>
    sounding.value.length
      ? t('views.home_dashboard.groups.alarm.sirens_on', { names: names(sounding.value) })
      : t('views.home_dashboard.groups.alarm.sirens_off', { count: sirens.value.length }),
  );

  const sirenAction = computed<HomeAlarmAction>(() =>
    sounding.value.length
      ? {
          icon: SilenceIcon,
          label: t('components.sensor_state.off'),
          ariaLabel: t('views.home_dashboard.groups.alarm.silence_all_aria'),
          guarded: false,
          ready: true,
          press: silence,
        }
      : {
          icon: SoundIcon,
          label: t('components.sensor_tile.sound'),
          ariaLabel: t('views.home_dashboard.groups.alarm.sound_all_aria'),
          guarded: true,
          ready: sirens.value.some(online),
          press: sound,
        },
  );
  const sirensRow = computed<HomeAlarmRow>(() => ({
    key: 'sirens',
    icon: sensorTypeIcon(SensorType.Siren, sounding.value.length > 0),
    name: t('views.home_dashboard.groups.alarm.sirens'),
    state: sirenText.value,
    on: sounding.value.length > 0,
    color: toneColor('alarm'),
    offline: !sirens.value.some(online),
    action: sirenAction.value,
  }));
  const sirenRows = computed(() => sirens.value.map(sirenRow));
  const watchRows = computed<HomeAlarmRow[]>(() => {
    const rows: HomeAlarmRow[] = [];
    if (contacts.value.length) {
      rows.push({
        key: 'contacts',
        icon: opened.value.length ? WindowOpenIcon : WindowClosedIcon,
        name: t('views.home_dashboard.groups.openings.title'),
        state: openText.value,
        on: opened.value.length > 0,
        color: toneColor('warn'),
        offline: !contacts.value.some(online),
      });
    }
    if (detectors.value.length) {
      const first = hits.value[0];
      const shown = first ?? detectors.value[0];
      rows.push({
        key: 'detectors',
        icon: sensorIcon(shown.type, shown),
        name: t('views.home_dashboard.groups.safety.title'),
        state: first ? alarmText.value : t('views.home_dashboard.groups.alarm.detectors_calm', { count: detectors.value.length }),
        on: !!first,
        color: first ? detectorColor(first) : toneColor('alarm'),
        offline: !detectors.value.some(online),
      });
    }
    return rows;
  });

  // the list shows every member on its own row, each opens its own sheet
  const memberRows = computed(() => [
    ...(panel.value ? [memberRow(panel.value, armed.value || !!alarmed.value, color.value)] : []),
    ...sirenRows.value,
    ...contacts.value.map((contact) => memberRow(contact, opened.value.includes(contact), toneColor('warn'))),
    ...detectors.value.map((detector) =>
      memberRow(detector, hits.value.includes(detector), hits.value.includes(detector) ? detectorColor(detector) : toneColor('alarm')),
    ),
  ]);

  function modeLabel(value: number | undefined): string {
    const name = Object.entries(STATES).find(([, state]) => state === value)?.[0];
    return name ? t(`components.sensor_state.${name}`) : '--';
  }

  function memberRow(sensor: ReactiveSensor, on: boolean, color: string): HomeAlarmRow {
    return {
      key: sensor.id,
      sensor,
      icon: sensorIcon(sensor.type, sensor),
      name: sensor.displayName.value,
      state: online(sensor) ? sensorStatus(sensor.type, sensor, t) : t('connection.offline'),
      on,
      color,
      offline: !online(sensor),
    };
  }

  function sirenRow(siren: ReactiveSensor): HomeAlarmRow {
    const name = siren.displayName.value;
    const on = sounding.value.includes(siren);
    return {
      ...memberRow(siren, on, toneColor('alarm')),
      action: {
        icon: on ? SilenceIcon : SoundIcon,
        label: on ? t('components.sensor_state.off') : t('components.sensor_tile.sound'),
        ariaLabel: t(`views.home_dashboard.groups.alarm.${on ? 'silence_name' : 'sound_name'}`, { name }),
        guarded: !on,
        ready: online(siren),
        press: () => send([siren], (target) => target.setProperty(SirenProperty.Active, !on)),
      },
    };
  }

  function arm(value: number) {
    send(ready.value, (system) => system.setProperty(SecuritySystemProperty.TargetState, value));
  }

  function disarm() {
    send(ready.value, (system) => system.setProperty(SecuritySystemProperty.TargetState, SecuritySystemState.Disarmed));
    // the sirens the alarm set off stop with it
    silence();
  }

  function sound() {
    send(sirens.value.filter(online), (siren) => siren.setProperty(SirenProperty.Active, true));
  }

  return {
    panel,
    ready,
    sirens,
    contacts,
    sounding,
    opened,
    mode,
    alarmed,
    armed,
    pending,
    armModes,
    color,
    cause,
    openText,
    sinceText,
    sirenText,
    sirenAction,
    sirensRow,
    sirenRows,
    watchRows,
    memberRows,
    modeLabel,
    arm,
    disarm,
  };
}

function online(sensor: ReactiveSensor): boolean {
  return sensor.online.value;
}
