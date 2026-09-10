export type AssistantReferenceKind = 'event' | 'episode' | 'camera' | 'download';

export interface AssistantReference {
  kind: AssistantReferenceKind;
  id: string;
  label?: string | null;
  cameraId?: string | null;
  timestamp?: number | null;
  url?: string | null;
}

export interface CuiAssistantReferencesProps {
  references: AssistantReference[];
}
