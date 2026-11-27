import { asyncComponent } from '@/common/asyncComponent.js';

import type { CameraConsoleProps } from '@/components/CuiDialog/templates/CameraConsole/types.js';
import type { DBCamera } from '@shared/types';

const CameraConsoleDialog = asyncComponent(() => import('@/components/CuiDialog/templates/CameraConsole/CameraConsole.vue'));

export function useCameraConsoleDialog() {
  const dialog = useCuiDialog();
  const { t } = useI18n();

  function openCameraConsole(camera: DBCamera) {
    dialog.openComponentDialog<CameraConsoleProps>(CameraConsoleDialog, {
      data: {
        title: t('components.dialog.title.log'),
        confirmText: t('components.form.button.download'),
        stayActive: true,
        contentProps: {
          cameraId: camera._id,
          cameraName: camera.name,
        },
        dialogContentClass: 'not-md:px-0 h-full md:h-[50vh]',
      },
    });
  }

  return { openCameraConsole };
}
