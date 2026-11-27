import type { DBHomeProfileRule } from '@shared/types';

export interface HomeProfileProps {
  name?: string;
  placeholder: string;
  rule?: DBHomeProfileRule;
  copyOf?: string;
  isDefault?: boolean;
}

export interface HomeProfileResult {
  name?: string;
  rule?: DBHomeProfileRule;
  copy: boolean;
}
