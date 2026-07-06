import type { CardProps } from 'primevue';
import type { HTMLAttributes } from 'vue';

export interface CuiListProps {
  /** Size passed to all CuiListItem children */
  size?: 'default' | 'large';
  /** Show dividers between items (default: true) */
  dividers?: boolean;
  cardProps?: CardProps;
  cardClass?: HTMLAttributes['class'];
  cardStyle?: HTMLAttributes['style'];
}
