import type { ClipDetectionPluginResponse } from '@camera.ui/sdk';

export interface PluginClipInterfaceProps {
  src: HTMLMediaElement['src'];
  response: ClipDetectionPluginResponse;
  onTextSearch: (text: string) => Promise<{ score: number }>;
}

export interface PluginClipInterfaceResult {
  query: string;
  rawScore: number;
  displayScore: number;
}

// CLIP ViT-B/32 cosine similarities range ~0.15 (unrelated) to ~0.35 (strong match).
// Remap to 0-100% for intuitive display.
export const CLIP_MIN = 0.15;
export const CLIP_MAX = 0.38;
