import { LawnMowerActivity, SensorType, VacuumActivity, VacuumCommand, sensorMeta } from '@camera.ui/sdk';

import { sensorPropertySpec, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useSensorSettings } from '../useSensorSettings.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { RobotPhase } from './types.js';

const PHASES: Partial<Record<string, RobotPhase>> = {
  [VacuumActivity.Cleaning]: 'working',
  [LawnMowerActivity.Mowing]: 'working',
  [VacuumActivity.Docked]: 'docked',
  [VacuumActivity.Returning]: 'returning',
  [VacuumActivity.Paused]: 'paused',
  [VacuumActivity.Idle]: 'idle',
  [VacuumActivity.Error]: 'error',
};

export function useRobot(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { choices, propertyLabel, send } = useSensorSettings(sensor);

  const type = sensor().type;
  const semantics = sensorMeta(type)!.semantics!;
  const activityProperty = semantics.stateProperty;
  const commandProperty = semantics.commandProperty!;
  const fanSpeedProperty = semantics.fanSpeed?.property;
  const lawn = type === SensorType.LawnMower;

  const activity = computed(() => sensor().getProperty<string>(activityProperty));
  const phase = computed(() => robotPhase(activity.value));
  const busy = computed(() => phase.value === 'working' || phase.value === 'returning');
  const error = computed(() => phase.value === 'error');
  const workColor = sensorToneColor(type, true) ?? toneColor('ok');
  const color = computed(() => (error.value ? toneColor('alarm') : workColor));

  const commands = computed(() => Object.values(sensorPropertySpec(sensor(), commandProperty)?.values ?? {}).map(String));
  const fanSpeeds = computed(() => (fanSpeedProperty ? choices(fanSpeedProperty) : []));
  const fanSpeed = computed(() => (fanSpeedProperty ? sensor().getProperty<string>(fanSpeedProperty) : undefined));

  const stateText = computed(() => {
    if (!sensor().online.value) return t('connection.offline');
    return activity.value ? commandLabel(activity.value) : '--';
  });

  function toggle() {
    const main = mainCommand(commands.value, busy.value);
    if (main) command(main);
  }

  function command(value: string) {
    send(commandProperty, value);
  }

  function setFanSpeed(value: string) {
    if (fanSpeedProperty) send(fanSpeedProperty, value);
  }

  function commandLabel(value: string): string {
    return t(`components.automation_nodes.${type}_state_${value}`);
  }

  function timelineColor(value: unknown): string | undefined {
    if (value === VacuumActivity.Error) return toneColor('alarm');
    return PHASES[String(value)] === 'working' ? workColor : undefined;
  }

  return {
    lawn,
    activityProperty,
    phase,
    busy,
    error,
    color,
    commands,
    fanSpeedProperty,
    fanSpeeds,
    fanSpeed,
    stateText,
    toggle,
    command,
    setFanSpeed,
    commandLabel,
    propertyLabel,
    timelineColor,
  };
}

export function robotPhase(activity: string | undefined): RobotPhase {
  return PHASES[activity ?? ''] ?? 'docked';
}

export function mainCommand(commands: string[], busy: boolean): string | undefined {
  if (busy && commands.includes(VacuumCommand.Pause)) return VacuumCommand.Pause;
  return commands.includes(VacuumCommand.Start) ? VacuumCommand.Start : undefined;
}
