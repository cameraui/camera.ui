import type { DownloadProgressPayload, IpcRendererEvent } from '@/types/electron';

export function useElectronDownloads() {
  const { t } = useI18n();
  const toast = useCuiToast();
  const { electron } = useElectron();

  const transfers = new Map<number, DownloadTransfer>();

  function onProgress(_event: IpcRendererEvent, download: DownloadProgressPayload) {
    const transfer = transfers.get(download.id) ?? track(download);

    if (download.state === 'progressing') {
      transfer.progress(download.loaded, download.total);
      return;
    }

    transfers.delete(download.id);
    transfer.end();
    if (download.state === 'failed') {
      toast.add({ severity: 'error', summary: t('views.recordings.download_failed'), detail: download.filename, life: 5000 });
    }
  }

  function track({ id, filename }: DownloadProgressPayload): DownloadTransfer {
    const transfer = trackDownload(filename);
    transfer.signal.addEventListener('abort', () => electron?.send('cancel-download', id), { once: true });
    transfers.set(id, transfer);
    return transfer;
  }

  onMounted(() => {
    try {
      electron?.on('download-progress', onProgress);
    } catch {
      // a desktop app that predates the channel refuses it
    }
  });

  onUnmounted(() => {
    electron?.removeListener('download-progress', onProgress);
  });
}
