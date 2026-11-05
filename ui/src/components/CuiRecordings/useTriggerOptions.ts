import { BASE_AUDIO_LABELS } from '@camera.ui/sdk';

import { audioLabelKey, sensorLabelKey } from '@/common/eventLabels.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

export function useTriggerOptions(types: MaybeRefOrGetter<readonly string[]>) {
  const { t } = useI18n();
  const { icons, generic } = resolveEventIcons();

  const sensorOptions = computed(() => toValue(types).map((type) => ({ value: type, label: t(sensorLabelKey(type)), icon: icons[type] ?? generic })));

  const soundOptions = computed(() => BASE_AUDIO_LABELS.map((label) => ({ value: label as string, label: t(audioLabelKey(label)), icon: icons[label] ?? generic })));

  return { sensorOptions, soundOptions };
}
