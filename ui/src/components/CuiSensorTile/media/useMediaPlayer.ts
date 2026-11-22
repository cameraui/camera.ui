import { MediaPlayerCommand, MediaPlayerKind, MediaPlayerProperty, MediaPlayerState, sensorMeta } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertySpec, sensorToneColor } from '@/common/sensorDisplay.js';

import { SEGMENT_ACTIVE, SEGMENT_SOFT } from '../frame/segments.js';
import { useSensorSettings } from '../useSensorSettings.js';
import { useVolumeLevel } from '../useVolumeLevel.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const PLAYING = new Set<string>([MediaPlayerState.Playing, MediaPlayerState.Buffering]);

export function useMediaPlayer(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const type = sensor().type;
  const semantics = sensorMeta(type)!.semantics!;
  const names = semantics.mediaPlayer!;
  const commandProperty = semantics.commandProperty!;
  const { choices, propertyLabel, send } = useSensorSettings(sensor);
  const { hasVolume, ratio, percent, inputVolume, commitVolume } = useVolumeLevel(sensor, names.volume!);

  const state = computed(() => sensor().getProperty<string>(MediaPlayerProperty.State));
  const kind = computed(() => sensor().getProperty<string>(MediaPlayerProperty.Kind) ?? MediaPlayerKind.Tv);
  const hasPower = computed(() => offers(names.power));
  const on = computed(() => (hasPower.value ? sensor().getProperty(names.power!) === true : state.value !== MediaPlayerState.Off));
  const lit = computed(() => (state.value ? state.value !== MediaPlayerState.Off : on.value));
  const playing = computed(() => PLAYING.has(state.value ?? ''));
  const color = computed(() => sensorToneColor(type, true));

  const hasMute = computed(() => offers(names.muted));
  const muted = computed(() => hasMute.value && sensor().getProperty(names.muted!) === true);

  const commands = computed(() => Object.values(sensorPropertySpec(sensor(), commandProperty)?.values ?? {}).map(String));
  const sources = computed(() => choices(names.source!));
  const source = computed(() => sensor().getProperty<string>(names.source!));
  const sourceLabel = computed(() => sources.value.find((option) => option.value === source.value)?.label ?? source.value);

  const title = computed(() => text(names.title));
  const artist = computed(() => text(names.artist));
  const stateWord = computed(() => (state.value ? t(`components.automation_nodes.${type}_state_${state.value}`) : t('components.sensor_state.off')));
  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (playing.value && title.value) return [title.value, artist.value].filter(Boolean).join(' · ');
    return stateWord.value;
  });

  function toggle() {
    if (hasPower.value) send(names.power!, !on.value);
    else playPause();
  }

  function playPause() {
    if (!playing.value) return command(MediaPlayerCommand.Play);
    command(commands.value.includes(MediaPlayerCommand.Pause) ? MediaPlayerCommand.Pause : MediaPlayerCommand.Stop);
  }

  function command(value: string) {
    send(commandProperty, value);
  }

  function setMuted(value: boolean) {
    send(names.muted!, value);
  }

  function setSource(value: string) {
    send(names.source!, value);
  }

  function text(property: string | undefined): string | undefined {
    const value = offers(property) ? sensor().getProperty(property) : undefined;
    return typeof value === 'string' && value ? value : undefined;
  }

  function offers(property: string | undefined): property is string {
    return !!property && sensorOffers(sensor(), property);
  }

  function timelineColor(value: unknown): string | undefined {
    if (PLAYING.has(String(value))) return SEGMENT_ACTIVE;
    return value === MediaPlayerState.Off || value === undefined || value === null ? undefined : SEGMENT_SOFT;
  }

  return {
    kind,
    hasPower,
    on,
    lit,
    playing,
    color,
    hasVolume,
    ratio,
    percent,
    hasMute,
    muted,
    commands,
    sources,
    source,
    sourceLabel,
    title,
    artist,
    stateWord,
    stateText,
    toggle,
    playPause,
    command,
    inputVolume,
    commitVolume,
    setMuted,
    setSource,
    propertyLabel,
    timelineColor,
  };
}
