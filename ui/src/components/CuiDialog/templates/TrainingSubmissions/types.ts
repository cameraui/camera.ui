import type { TrainingSubmissionsQuery } from '@shared/types';

export interface TrainingSubmissionsFilterOption {
  key: string;
  label: string;
  count: number;
  query: TrainingSubmissionsQuery;
}

export const TRAINING_SUBMISSIONS_DIALOG_SIZE = {
  desktop: {
    maxWidth: '720px',
    width: '90vw',
  },
};
