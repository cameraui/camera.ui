export interface FaceNewPersonFace {
  clarity?: number;
  alsoFiledUnder?: string[];
}

export interface FaceNewPersonProps {
  knownNames?: string[];
  faces?: FaceNewPersonFace[];
}
