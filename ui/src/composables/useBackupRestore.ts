import { restoreBackupFn } from '@/api/routes/backup.js';
import { restartSystemFn } from '@/api/routes/server.js';
import { extractErrorMessage } from '@/common/utils.js';

import type { UiLocalStorage } from '@shared/types';

export type BackupRestorePhase = 'idle' | 'uploading' | 'restoring' | 'restarting';

const active = ref(false);
const phase = ref<BackupRestorePhase>('idle');
const uploadPercent = ref(0);

export const isRestoreActive = active;

function restoreLocalStorage(ls: Partial<UiLocalStorage>): void {
  if (ls.theme) {
    localStorage.setItem('theme', JSON.stringify(ls.theme));
  }

  if (ls.language) {
    localStorage.setItem('language', ls.language);
  }

  if (ls.ui) {
    localStorage.setItem('ui', JSON.stringify(ls.ui));
  }
}

export function useBackupRestore() {
  async function run(file: File): Promise<boolean> {
    const toast = useCuiToast();

    active.value = true;
    phase.value = 'uploading';
    uploadPercent.value = 0;

    try {
      const fd = new FormData();
      fd.append('upload', file);

      const ls = await restoreBackupFn(fd, (p) => {
        uploadPercent.value = p;
        if (p >= 100) phase.value = 'restoring';
      });

      restoreLocalStorage(ls);
    } catch (error) {
      active.value = false;
      phase.value = 'idle';
      toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
      return false;
    }

    phase.value = 'restarting';

    const { beginServerRestart } = useServerRestart();
    beginServerRestart();

    await restartSystemFn().catch(() => {});
    await useAuthStore().logout();

    active.value = false;
    phase.value = 'idle';

    return true;
  }

  return { active, phase, uploadPercent, restoreLocalStorage, run };
}
