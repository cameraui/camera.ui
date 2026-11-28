import { useAllSensors } from '@camera.ui/browser';
import { BatteryProperty, ChargingState, sensorMeta, SensorType, VacuumCommand } from '@camera.ui/sdk';
import DockIcon from '~icons/mdi/home-import-outline';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';

import { SensorsQuery } from '@/api/routes/sensors.js';
import { sensorIcon, sensorPropertySpec, sensorToneColor, sensorTypeIcon, toneColor } from '@/common/sensorDisplay.js';
import { LOW_BATTERY } from '@/components/CuiSensorTile/measurement/scales.js';
import { robotPhase } from '@/components/CuiSensorTile/robot/useRobot.js';

import { useGroupSend } from './groupControl.js';

import type { RobotPhase } from '@/components/CuiSensorTile/robot/types.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

export interface HomeRobotBattery {
  level: number;
  charging: boolean;
  low: boolean;
}

export interface HomeRobotAction {
  key: string;
  icon: Component;
  label: string;
  command: string;
  targets: ReactiveSensor[];
}

export type HomeRobotVariant = 'cell' | 'chip' | 'row';

export interface CuiHomeRobotItemProps {
  sensor: ReactiveSensor;
  battery?: HomeRobotBattery;
  variant: HomeRobotVariant;
  disabled: boolean;
}

export interface CuiHomeRobotBatteryProps {
  battery: HomeRobotBattery;
}

const ROBOT_TYPES: string[] = [SensorType.Vacuum, SensorType.LawnMower];
const DRIVING: RobotPhase[] = ['working', 'returning'];
const LIT: RobotPhase[] = [...DRIVING, 'error'];

export function useRobotGroup(sensors: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();

  const robots = computed(() => sensors().filter((sensor) => ROBOT_TYPES.includes(sensor.type)));
  const online = computed(() => robots.value.filter((robot) => robot.online.value));
  const working = computed(() => inPhase('working'));
  const paused = computed(() => inPhase('paused'));
  const out = computed(() => online.value.filter((robot) => DRIVING.includes(phaseOf(robot))));
  const failed = computed(() => inPhase('error')[0]);
  const lead = computed<ReactiveSensor | undefined>(() => failed.value ?? out.value[0]);
  const docked = computed(() => online.value.length > 0 && online.value.every((robot) => phaseOf(robot) === 'docked'));
  const icon = computed(() => (lead.value ? sensorIcon(lead.value.type, lead.value) : sensorTypeIcon(robots.value[0]?.type ?? SensorType.Vacuum)));
  const color = computed(() => {
    const shown = lead.value ?? robots.value[0];
    return shown ? robotColor(shown) : toneColor('info');
  });

  const actions = computed<HomeRobotAction[]>(() => {
    if (working.value.length) return usable([pause(working.value), dock([...working.value, ...paused.value])]);
    if (paused.value.length) return usable([start('resume', t('views.home_dashboard.groups.robots.resume'), paused.value), dock(paused.value)]);
    const oneKind = new Set(robots.value.map((robot) => robot.type)).size === 1;
    if (!oneKind || out.value.length) return [];
    const ready = online.value.filter((robot) => phaseOf(robot) !== 'error');
    return usable([start('start', t('views.home_dashboard.groups.robots.start_all'), ready)]);
  });

  const stateText = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (failed.value) return t('views.home_dashboard.groups.robots.error', { name: failed.value.displayName.value });
    if (out.value.length) return t('views.home_dashboard.groups.robots.active', { names: out.value.map((robot) => robot.displayName.value).join(', ') });
    return docked.value ? t('views.home_dashboard.groups.robots.all_docked') : t('views.home_dashboard.groups.robots.none_active');
  });
  const summary = computed(() => {
    if (!online.value.length || failed.value) return stateText.value;
    if (out.value.length) return t('views.home_dashboard.groups.robots.active_count', { count: out.value.length });
    return docked.value ? t('views.home_dashboard.groups.robots.docked') : t('views.home_dashboard.groups.robots.none_active');
  });
  const hero = computed(() => (failed.value ? activityLabel(failed.value) : summary.value));

  function inPhase(phase: RobotPhase): ReactiveSensor[] {
    return online.value.filter((robot) => phaseOf(robot) === phase);
  }

  function pause(targets: ReactiveSensor[]): HomeRobotAction {
    return { key: 'pause', icon: PauseIcon, label: commandLabel(targets, VacuumCommand.Pause), command: VacuumCommand.Pause, targets };
  }

  function dock(targets: ReactiveSensor[]): HomeRobotAction {
    return { key: 'dock', icon: DockIcon, label: commandLabel(targets, VacuumCommand.Dock), command: VacuumCommand.Dock, targets };
  }

  function start(key: string, label: string, targets: ReactiveSensor[]): HomeRobotAction {
    return { key, icon: PlayIcon, label, command: VacuumCommand.Start, targets };
  }

  function commandLabel(targets: ReactiveSensor[], command: string): string {
    return t(`components.automation_nodes.${targets[0]?.type ?? SensorType.Vacuum}_state_${command}`);
  }

  function activityLabel(robot: ReactiveSensor): string {
    return t(`components.automation_nodes.${robot.type}_state_${robot.getProperty<string>(activityProperty(robot))}`);
  }

  function run(action: HomeRobotAction) {
    send(action.targets, (robot) => robot.setProperty(commandProperty(robot), action.command));
  }

  return { robots, online, failed, lead, icon, color, actions, stateText, summary, hero, run };
}

export function useRobotBatteries(robots: () => ReactiveSensor[]) {
  const { data: sensorList } = new SensorsQuery().getSensorsQuery();
  const batteryIds = computed(() => (sensorList.value ?? []).flatMap((sensor) => (sensor.device && sensor.type === SensorType.Battery ? [sensor.id] : [])));
  const { sensors: live } = useAllSensors({ sensorIds: batteryIds });

  // a robot reports its charge through the battery sensor of its device, which is never a group member
  const devices = computed(() => new Map((sensorList.value ?? []).flatMap((sensor) => (sensor.device ? [[sensor.id, sensor.device.id] as const] : []))));
  const byDevice = computed(() => {
    const found = new Map<string, ReactiveSensor>();
    for (const sensor of live.value) {
      const device = sensor.type === SensorType.Battery ? devices.value.get(sensor.id) : undefined;
      if (device) found.set(device, sensor);
    }
    return found;
  });

  return computed(() => {
    const batteries = new Map<string, HomeRobotBattery>();
    for (const robot of robots()) {
      const device = devices.value.get(robot.id);
      const sensor = device ? byDevice.value.get(device) : undefined;
      const level = sensor?.online.value ? sensor.getProperty<number>(BatteryProperty.Level) : undefined;
      if (!sensor || typeof level !== 'number') continue;
      batteries.set(robot.id, {
        level: Math.round(level),
        charging: sensor.getProperty(BatteryProperty.Charging) === ChargingState.Charging,
        low: sensor.getProperty(BatteryProperty.Low) === true || level < LOW_BATTERY,
      });
    }
    return batteries;
  });
}

export function robotLit(robot: ReactiveSensor): boolean {
  return robot.online.value && LIT.includes(phaseOf(robot));
}

export function robotColor(robot: ReactiveSensor): string {
  if (phaseOf(robot) === 'error') return toneColor('alarm');
  return sensorToneColor(robot.type, true) ?? toneColor('ok');
}

function phaseOf(robot: ReactiveSensor): RobotPhase {
  return robotPhase(robot.getProperty<string>(activityProperty(robot)));
}

function activityProperty(robot: ReactiveSensor): string {
  return sensorMeta(robot.type)!.semantics!.stateProperty;
}

function commandProperty(robot: ReactiveSensor): string {
  return sensorMeta(robot.type)!.semantics!.commandProperty!;
}

function usable(actions: HomeRobotAction[]): HomeRobotAction[] {
  return actions
    .map((action) => ({ ...action, targets: action.targets.filter((robot) => commandsOf(robot).includes(action.command)) }))
    .filter((action) => action.targets.length);
}

function commandsOf(robot: ReactiveSensor): string[] {
  return Object.values(sensorPropertySpec(robot, commandProperty(robot))?.values ?? {}).map(String);
}
