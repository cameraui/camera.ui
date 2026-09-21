export interface PluginFaceRecognitionMatch {
  identity: string;
  score: number;
}

export interface PluginFaceRecognitionProps {
  src: HTMLMediaElement['src'];
  embeddingModel: string;
  dimensions: number;
  landmarks?: [number, number][];
  quality?: number;
  onMatch: (sensitivity: string) => Promise<PluginFaceRecognitionMatch | undefined>;
}

export const FACE_RECOGNITION_SENSITIVITIES = ['strict', 'balanced', 'relaxed'];
