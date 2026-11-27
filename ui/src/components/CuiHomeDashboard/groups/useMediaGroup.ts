import { MediaPlayerCommand, MediaPlayerProperty, MediaPlayerState, SensorType } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertySpec, sensorToneColor } from '@/common/sensorDisplay.js';
import { fromRatio, sensorRange, toRatio } from '@/components/CuiSensorTile/range.js';

import { useGroupLevel, useGroupSend } from './groupControl.js';
import { isAwake, isPlaying, nowPlaying, playerState, playerText } from './media.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const SKIPS: string[] = [MediaPlayerCommand.Previous, MediaPlayerCommand.Next];

export function useMediaGroup(players: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();

  const resumable = shallowRef<string[]>([]);

  const online = computed(() => players().filter((player) => player.online.value));
  const playing = computed(() => online.value.filter(isPlaying));
  const paused = computed(() => online.value.filter((player) => playerState(player) === MediaPlayerState.Paused));
  const awake = computed(() => online.value.filter(isAwake));
  const main = computed(() => playing.value[0] ?? paused.value[0]);
  const color = sensorToneColor(SensorType.MediaPlayer, true);

  const hasTransport = computed(() => online.value.some((player) => commandsOf(player).length > 0));
  const hasSkip = computed(() => online.value.some(skips));
  const skipping = computed(() => (playing.value.length ? playing.value : paused.value).filter(skips));
  const pausing = computed(() => playing.value.filter((player) => offers(player, MediaPlayerCommand.Pause) || offers(player, MediaPlayerCommand.Stop)));
  const resuming = computed(() => {
    const back = paused.value.filter((player) => resumable.value.includes(player.id));
    return (back.length ? back : paused.value.slice(0, 1)).filter((player) => offers(player, MediaPlayerCommand.Play));
  });
  const canPlayPause = computed(() => (playing.value.length ? pausing.value : resuming.value).length > 0);
  const canSkip = computed(() => skipping.value.length > 0);

  const hasVolume = computed(() => online.value.some(setsVolume));
  const volumeTargets = computed(() => (playing.value.length ? playing.value : awake.value).filter(setsVolume));
  const canSetVolume = computed(() => volumeTargets.value.length > 0);
  const {
    preview,
    input: inputVolume,
    commit: commitVolume,
  } = useGroupLevel(
    () => volumeTargets.value,
    (player, ratio) => player.setProperty(MediaPlayerProperty.Volume, fromRatio(ratio, volumeRange(player))),
  );
  const volume = computed(() => preview.value ?? averageVolume(volumeTargets.value));
  const percent = computed(() => Math.round(volume.value * 100));
  const muted = computed(() => volumeTargets.value.length > 0 && volumeTargets.value.every((player) => player.getProperty(MediaPlayerProperty.Muted) === true));

  const stateText = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (playing.value.length) return t('views.home_dashboard.groups.media.playing', { names: playing.value.map((player) => player.displayName.value).join(', ') });
    const first = paused.value[0] ?? awake.value[0];
    return first ? stateWord(first) : t('views.home_dashboard.groups.media.off');
  });
  const hero = computed(() => {
    if (main.value) return nowPlaying(main.value) ?? stateWord(main.value);
    return awake.value.length ? stateWord(awake.value[0]) : t('components.sensor_state.off');
  });
  const heroNote = computed(() => (main.value && playerText(main.value, MediaPlayerProperty.Title) ? playerText(main.value, MediaPlayerProperty.Artist) : undefined));

  function playPause() {
    if (!playing.value.length) {
      send(resuming.value, (player) => player.setProperty(MediaPlayerProperty.Command, MediaPlayerCommand.Play));
      return;
    }
    resumable.value = pausing.value.map((player) => player.id);
    send(pausing.value, (player) =>
      player.setProperty(MediaPlayerProperty.Command, offers(player, MediaPlayerCommand.Pause) ? MediaPlayerCommand.Pause : MediaPlayerCommand.Stop),
    );
  }

  function skip(command: string) {
    send(
      skipping.value.filter((player) => offers(player, command)),
      (player) => player.setProperty(MediaPlayerProperty.Command, command),
    );
  }

  function stateWord(player: ReactiveSensor): string {
    const state = playerState(player);
    if (state) return t(`components.automation_nodes.mediaPlayer_state_${state}`);
    return t(`components.sensor_state.${isAwake(player) ? 'on' : 'off'}`);
  }

  return {
    playing,
    main,
    color,
    hasTransport,
    hasSkip,
    canSkip,
    canPlayPause,
    hasVolume,
    canSetVolume,
    volume,
    percent,
    muted,
    stateText,
    hero,
    heroNote,
    playPause,
    skip,
    inputVolume,
    commitVolume,
  };
}

function commandsOf(player: ReactiveSensor): string[] {
  return Object.values(sensorPropertySpec(player, MediaPlayerProperty.Command)?.values ?? {}).map(String);
}

function offers(player: ReactiveSensor, command: string): boolean {
  return commandsOf(player).includes(command);
}

function skips(player: ReactiveSensor): boolean {
  return SKIPS.some((command) => offers(player, command));
}

function setsVolume(player: ReactiveSensor): boolean {
  return sensorOffers(player, MediaPlayerProperty.Volume);
}

function volumeRange(player: ReactiveSensor) {
  return sensorRange(player, MediaPlayerProperty.Volume, 0, 100);
}

function averageVolume(players: ReactiveSensor[]): number {
  if (!players.length) return 0;
  return players.reduce((total, player) => total + toRatio(player.getProperty<number>(MediaPlayerProperty.Volume) ?? 0, volumeRange(player)), 0) / players.length;
}
