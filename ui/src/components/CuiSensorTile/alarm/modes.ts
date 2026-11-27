import { SecuritySystemState } from '@camera.ui/sdk';
import HomeIcon from '~icons/mdi/shield-home';
import AwayIcon from '~icons/mdi/shield-lock';
import NightIcon from '~icons/mdi/shield-moon';

import type { Component } from 'vue';

const MODE_ICONS: Partial<Record<number, Component>> = {
  [SecuritySystemState.StayArm]: HomeIcon,
  [SecuritySystemState.AwayArm]: AwayIcon,
  [SecuritySystemState.NightArm]: NightIcon,
};

export function securityModeIcon(mode: number): Component {
  return MODE_ICONS[mode] ?? AwayIcon;
}
