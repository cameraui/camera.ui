import { MediaPlayerKind, MediaPlayerProperty, MediaPlayerState } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertySpec } from '@/common/sensorDisplay.js';
import { PLAYING } from '@/components/CuiSensorTile/media/useMediaPlayer.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export interface CuiHomeMediaRowProps {
  sensor: ReactiveSensor;
  disabled: boolean;
}

const SCREENS = new Set<string>([MediaPlayerKind.Tv, MediaPlayerKind.Projector]);

export function playerState(player: ReactiveSensor): string | undefined {
  return player.getProperty<string>(MediaPlayerProperty.State);
}

export function isPlaying(player: ReactiveSensor): boolean {
  return PLAYING.has(playerState(player) ?? '');
}

export function isAwake(player: ReactiveSensor): boolean {
  const state = playerState(player);
  return state ? state !== MediaPlayerState.Off : player.getProperty(MediaPlayerProperty.On) === true;
}

export function isScreen(player: ReactiveSensor): boolean {
  return SCREENS.has(player.getProperty<string>(MediaPlayerProperty.Kind) ?? MediaPlayerKind.Tv);
}

export function playerRank(player: ReactiveSensor): number {
  if (!player.online.value) return 4;
  if (isPlaying(player)) return 0;
  if (playerState(player) === MediaPlayerState.Paused) return 1;
  return isAwake(player) ? 2 : 3;
}

export function playerText(player: ReactiveSensor, property: string): string | undefined {
  const value = sensorOffers(player, property) ? player.getProperty(property) : undefined;
  return typeof value === 'string' && value ? value : undefined;
}

export function nowPlaying(player: ReactiveSensor): string | undefined {
  const title = playerText(player, MediaPlayerProperty.Title);
  if (title) return title;
  const source = playerText(player, MediaPlayerProperty.Source);
  return sensorPropertySpec(player, MediaPlayerProperty.Source)?.choices?.find((choice) => String(choice.value) === source)?.label ?? source;
}
