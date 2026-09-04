import type { DBTrainingCandidate, DBTrainingCandidateBox } from '@shared/types';

export interface TrainingBoxEditorProps {
  candidates: DBTrainingCandidate[];
  startId: string;
  cameraName: (cameraId: string) => string;
  imageUrl: (id: string) => string;
  onSave: (id: string, boxes: DBTrainingCandidateBox[], status: DBTrainingCandidate['status']) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const TRAINING_LABELS = ['person', 'vehicle', 'animal', 'package', 'face', 'license_plate'] as const;

export const TRAINING_BOX_EDITOR_DIALOG_SIZE = {
  desktop: {
    maxWidth: '1280px',
    width: '85vw',
  },
};
