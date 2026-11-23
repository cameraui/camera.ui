import { AudioProperty, SensorType } from '@camera.ui/sdk';

import { detectionStyle } from '@/common/detectionLabels.js';
import { audioLabelKey, detectionLabelKey } from '@/common/eventLabels.js';
import { formatMeasurement, sensorPropertySpec, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useCameraRecord } from '../useCameraRecord.js';
import { useRelativeTime } from '../useRelativeTime.js';
import { HELPER_TYPES } from './groups.js';

import type { DetectionBox } from './types.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { Detection, FaceDetection, LicensePlateDetection, TrackedDetection } from '@camera.ui/sdk';

type AnyDetection = Detection & Partial<Pick<FaceDetection, 'identity'> & Pick<LicensePlateDetection, 'plateText'> & Pick<TrackedDetection, 'trackId'>>;

const NAME_PROPERTIES: Partial<Record<string, string>> = {
  [SensorType.Object]: 'labels',
  [SensorType.Face]: 'identities',
  [SensorType.LicensePlate]: 'plates',
  [SensorType.Classifier]: 'labels',
};

export function useDetection(sensor: () => ReactiveSensor<object>) {
  const { t, te } = useI18n();
  const { timeAgo } = useRelativeTime();
  const camera = useCameraRecord(sensor().boundCameraId);

  const type = sensor().type;
  const helper = HELPER_TYPES.includes(type);
  const audio = type === SensorType.Audio;

  const cameraDisabled = computed(() => camera.value?.disabled === true);
  const active = computed(() => sensor().getProperty('detected') === true);
  const color = computed(() => sensorToneColor(type, true) ?? toneColor('warn'));
  const detections = computed(() => (active.value ? (sensor().getProperty<AnyDetection[]>('detections') ?? []) : []));
  const lastTriggered = computed(() => sensor().getProperty<number>('lastTriggered'));
  const decibels = computed(() => (audio ? sensor().getProperty<number>(AudioProperty.Decibels) : undefined));

  const names = computed(() => {
    if (!active.value) return [];
    const property = NAME_PROPERTIES[type];
    const reported = property ? sensor().getProperty<string[]>(property) : undefined;
    const raw = reported?.length ? reported : audio || type === SensorType.Object ? detections.value.map((detection) => detection.label) : [];
    return [...new Set(raw)].map((name) => (type === SensorType.Face || type === SensorType.LicensePlate ? name : labelText(name)));
  });

  const boxes = computed<DetectionBox[]>(() => {
    if (audio) return [];
    return detections.value.map((detection, index) => ({
      key: String(detection.trackId ?? index),
      box: detection.box,
      color: detectionStyle(styleKey(detection)).color,
      text: boxText(detection),
    }));
  });

  const levelText = computed(() => (decibels.value === undefined ? '--' : formatMeasurement(decibels.value, sensorPropertySpec(sensor(), AudioProperty.Decibels), 0)));

  const detectedText = computed(() => {
    if (type === SensorType.Face && names.value.length === 0) return t('components.similar.unknown_face');
    return t('components.sensor_state.detected');
  });

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (cameraDisabled.value) return t('components.sensor_tile.camera_disabled');
    if (helper) return t('components.sensor_tile.ready');
    if (active.value) {
      if (names.value.length) return names.value.join(', ');
      return type === SensorType.Motion ? t(detectionLabelKey('motion')) : detectedText.value;
    }
    if (audio && decibels.value !== undefined) return levelText.value;
    if (lastTriggered.value) return timeAgo(lastTriggered.value);
    return t('components.sensor_state.idle');
  });

  function labelText(label: string): string {
    const key = audio ? audioLabelKey(label) : detectionLabelKey(label);
    return te(key) ? t(key) : label.replaceAll('_', ' ');
  }

  function styleKey(detection: AnyDetection): string {
    if (detection.attribute === 'face' || detection.attribute === 'license_plate') return detection.attribute;
    if (type === SensorType.Motion || type === SensorType.Classifier) return type;
    return detection.label;
  }

  function boxText(detection: AnyDetection): string | undefined {
    if (type === SensorType.Motion) return undefined;
    if (detection.attribute === 'face') return detection.identity ?? t('components.similar.unknown_face');
    if (detection.attribute === 'license_plate') return detection.plateText;
    if (type === SensorType.Classifier && detection.attribute) return labelText(detection.attribute);
    return labelText(detection.label);
  }

  return { helper, audio, cameraDisabled, active, color, names, boxes, decibels, levelText, lastTriggered, detectedText, stateText, timeAgo };
}
