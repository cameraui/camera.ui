import type { AssistantQuestion } from '@shared/types';

export interface CuiAssistantQuestionProps {
  question: AssistantQuestion;
  canResolve: boolean;
  busy?: boolean;
}

export interface CuiAssistantQuestionEmits {
  (e: 'answer', answer: string): void;
  (e: 'skip'): void;
}
