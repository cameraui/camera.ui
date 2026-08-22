import PersonIcon from '~icons/bi/person-fill';
import AnimalIcon from '~icons/fluent/animal-paw-print-24-filled';
import VehicleIcon from '~icons/fluent/vehicle-car-16-filled';
import MotionIcon from '~icons/healthicons/running-24px';
import BoxesIcon from '~icons/lucide/boxes';
import LicensePlateIcon from '~icons/mdi/card-text-outline';
import FaceIcon from '~icons/mdi/face-recognition';
import ClassifierIcon from '~icons/mdi/tag-multiple';

import type { Component } from 'vue';

export interface DetectionStyle {
  color: string;
  highlight: string;
  icon: Component;
}

const STYLES: Record<string, DetectionStyle> = {
  motion: { color: '#A855F7', highlight: 'rgba(168, 85, 247, 0.1)', icon: MotionIcon },
  animal: { color: '#22C55E', highlight: 'rgba(34, 197, 94, 0.1)', icon: AnimalIcon },
  person: { color: '#3B82F6', highlight: 'rgba(59, 130, 246, 0.1)', icon: PersonIcon },
  vehicle: { color: '#EF4444', highlight: 'rgba(239, 68, 68, 0.1)', icon: VehicleIcon },
  face: { color: '#F59E0B', highlight: 'rgba(245, 158, 11, 0.1)', icon: FaceIcon },
  license_plate: { color: '#06B6D4', highlight: 'rgba(6, 182, 212, 0.1)', icon: LicensePlateIcon },
  classifier: { color: '#8B5CF6', highlight: 'rgba(139, 92, 246, 0.1)', icon: ClassifierIcon },
  other: { color: '#CAC443', highlight: 'rgba(202, 196, 67, 0.1)', icon: BoxesIcon },
};

export function detectionStyle(label: string): DetectionStyle {
  return STYLES[label] ?? STYLES.other;
}
