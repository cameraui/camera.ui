import type { DBCamera, DBCamviewLayout } from '@shared/types';

export interface CamviewFormProps {
  form?: DBCamviewLayout;
  type: 'view' | 'dnd';
  cameras: DBCamera[];
  views: DBCamviewLayout[];
}
