export interface SimilarImageSearchProps {
  image: Blob;
}

export const READING_SLOTS = ['object', 'objectAssist', 'face', 'faceEmbedder', 'personEmbedder', 'licensePlate', 'clip', 'segmenter'] as const;
