export interface BaseNodeProps {
  icon: Component;
  label: string;
  subtitle?: string;
  color: string;
  selected?: boolean;
  showInput?: boolean;
  showOutput?: boolean;
  maxInputs?: number;
  warning?: string;
}

export const BASE_NODE_DEFAULTS = {
  maxInputs: Infinity,
} satisfies Partial<BaseNodeProps>;
