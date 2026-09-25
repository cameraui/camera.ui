import { cropImage } from '@/utils/imageCrop.js';
import { maskPrivacyZones } from '@/utils/privacyMask.js';

import type { SimilarSearchRequest } from '@/components/CuiSimilarPicker/types.js';
import type { FrameObject, SimilarQuery } from '@camera.ui/nvr';
import type { PrivacyZone } from '@camera.ui/sdk';

export type SimilarPickEnd = 'leave' | 'stop';

export interface UseSimilarPickOptions {
  capture: () => Promise<Blob | string | null | undefined> | Blob | string | null | undefined;
  privacyZones: () => PrivacyZone[];
  onPick: (request: SimilarSearchRequest) => void;
  onClose?: (end: SimilarPickEnd) => void;
}

export function useSimilarPick(options: UseSimilarPickOptions) {
  const toast = useCuiToast();
  const { t } = useI18n();

  const picking = ref(false);
  const frame = shallowRef<Blob>();
  let takes = 0;

  async function start(): Promise<void> {
    picking.value = true;
    await retake();
  }

  async function retake(): Promise<void> {
    const take = ++takes;
    frame.value = undefined;
    const masked = await readFrame().catch(() => null);
    if (!picking.value || take !== takes) return;
    if (!masked) {
      toast.add({ severity: 'error', detail: t('components.similar.failed'), life: 4000 });
      close();
      return;
    }
    frame.value = masked;
  }

  function close(end: SimilarPickEnd = 'leave'): void {
    if (!picking.value) return;
    takes++;
    picking.value = false;
    frame.value = undefined;
    options.onClose?.(end);
  }

  async function readFrame(): Promise<Blob | null> {
    const source = await options.capture();
    return source ? maskPrivacyZones(source, options.privacyZones()) : null;
  }

  async function pick(object: FrameObject & { query: SimilarQuery }): Promise<void> {
    const crop = frame.value ? await cropImage(frame.value, object.box, object.mask) : undefined;
    options.onPick({ query: object.query, objectLabel: object.label, crop });
  }

  return { picking, frame, start, retake, close, pick };
}
