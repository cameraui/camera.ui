import type { FrameObject } from '@camera.ui/nvr';

export const AUDIO_LABEL_I18N: Record<string, string> = {
  doorbell: 'views.recordings.audio_doorbell',
  glass_break: 'views.recordings.audio_glass_break',
  siren: 'views.recordings.audio_siren',
  speaking: 'views.recordings.audio_speaking',
  gunshot: 'views.recordings.audio_gunshot',
  dog_bark: 'views.recordings.audio_dog_bark',
  baby_cry: 'views.recordings.audio_baby_cry',
  alarm: 'views.recordings.audio_alarm',
  scream: 'views.recordings.audio_scream',
  cat: 'views.recordings.audio_cat',
  car_alarm: 'views.recordings.audio_car_alarm',
  smoke_alarm: 'views.recordings.audio_smoke_alarm',
};

export const ATTRIBUTE_I18N: Record<string, string> = {
  face: 'views.recordings.attr_face',
  license_plate: 'views.recordings.attr_license_plate',
};

export const SENSOR_EVENT_LABELS: Record<string, string> = {
  motion: 'views.recordings.sensor_motion',
  audio: 'views.recordings.sensor_audio',
  contact: 'views.recordings.sensor_contact',
  doorbell: 'views.recordings.sensor_doorbell',
  switch: 'views.recordings.sensor_switch',
  light: 'views.recordings.sensor_light',
  siren: 'views.recordings.sensor_siren',
  security_system: 'views.recordings.sensor_security_system',
  'line-crossing': 'views.recordings.sensor_line_crossing',
};

/** Sensor triggers a camera can push for. Motion and audio are covered by the detection labels. */
export const NOTIFY_SENSOR_TYPES = [
  'doorbell',
  'contact',
  'siren',
  'security_system',
  'smoke',
  'gas',
  'carbonMonoxide',
  'heat',
  'leak',
  'cold',
  'vibration',
  'tamper',
  'problem',
] as const;

export function detectionLabelKey(label: string): string {
  return `components.timeline.type_${label}`;
}

export function audioLabelKey(label: string): string {
  return AUDIO_LABEL_I18N[label] ?? label;
}

export function sensorLabelKey(type: string): string {
  return SENSOR_EVENT_LABELS[type] ?? `views.recordings.sensor_${type}`;
}

export function attributeLabelKey(attribute: string): string {
  return ATTRIBUTE_I18N[attribute] ?? `views.recordings.attr_${attribute}`;
}

export function vehicleColorKey(color: string): string {
  return `views.recordings.vehicle_color_${color}`;
}

export function vehicleTypeKey(type: string): string {
  return `views.recordings.vehicle_type_${type}`;
}

export function frameObjectText(object: FrameObject, t: (key: string) => string): string {
  if (object.label === 'vehicle') {
    const parts = [object.plate, object.color && t(vehicleColorKey(object.color)), object.vehicleType && t(vehicleTypeKey(object.vehicleType))].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    return object.query ? t('components.similar.vehicle') : t('components.similar.no_vehicle_features');
  }
  if (object.name) return object.name;
  return object.query ? t('components.similar.unknown_face') : t('components.similar.no_face');
}
