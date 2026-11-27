import type { DBCamera } from '@shared/types';

export function sortByOrder(cameraList: DBCamera[], order: string[]): DBCamera[] {
  return [...cameraList].sort((a, b) => {
    const indexA = order.indexOf(a._id);
    const indexB = order.indexOf(b._id);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}
