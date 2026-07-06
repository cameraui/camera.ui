import { Logger } from '@camera.ui/logger';
import { getCurrentInstance } from 'vue';

export function useLogger(scope?: string): Logger {
  if (!scope) {
    const instance = getCurrentInstance();
    const type = instance?.type as { __name?: string; name?: string } | undefined;
    scope = type?.__name ?? type?.name ?? 'UI';
  }
  return new Logger(scope);
}
