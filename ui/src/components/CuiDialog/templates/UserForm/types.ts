import type { DBUser } from '@shared/types';

export interface UserFormProps {
  user?: DBUser;
  onStartPassword?: (username: string, startPassword: string) => void;
}
