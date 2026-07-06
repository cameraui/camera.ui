export interface FaceDetailFaceImage {
  id: string;
  src: string;
  confidence: number;
}

export interface FaceDetailFace {
  name: string;
  imageCount: number;
  images: FaceDetailFaceImage[];
}

export interface FaceDetailProps {
  face: FaceDetailFace;
  onRemoveImage: (idx: number) => void;
  onDeletePerson: () => void;
}
