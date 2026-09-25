import type { SegmentedObject } from '@/utils/segmentPicture.js';

export interface PluginSegmentationInterfaceProps {
  src: HTMLMediaElement['src'];
  objects: SegmentedObject[];
}
