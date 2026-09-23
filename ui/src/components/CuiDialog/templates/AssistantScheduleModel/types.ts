export interface AssistantScheduleModelProps {
  models: { _id: string; name: string }[];
  modelId?: string | null;
  fallback?: string;
}
