export const FACE_DETAIL_FEW_PICTURES = 10;

export type FaceDetailMarkKind = 'filed_under' | 'unclear' | 'partly_visible' | 'same_as';

export interface FaceDetailMark {
  kind: FaceDetailMarkKind;
  text: string;
  danger: boolean;
}

export interface FaceDetailFaceImage {
  id: string;
  src: string;
  confidence: number;
  clarity?: number;
  sameAs?: string;
  alsoFiledUnder?: string[];
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
