import type { AssistantModelView } from '@shared/types';

export const NEW_KEY_SOURCE = 'new';

export interface AssistantModelFormProps {
  entry?: AssistantModelView;
  models: AssistantModelView[];
}
