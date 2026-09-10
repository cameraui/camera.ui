import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { DBAssistantCard } from '@shared/types';

export interface CuiAssistantCardProps {
  card: DBAssistantCard;
  references?: AssistantReference[];
}
