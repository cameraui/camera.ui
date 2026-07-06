import type { HTMLAttributes } from 'vue';

export interface CuiImageProps {
  src?: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
  imageStyle?: HTMLAttributes['style'];
  imageClass?: HTMLAttributes['class'];
  imageContainerClass?: HTMLAttributes['class'];
  imageContainerStyle?: HTMLAttributes['style'];
}
