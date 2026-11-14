export interface DownloadProgress {
  id: number;
  filename: string;
  loaded: number;
  total?: number;
  cancel: () => void;
}

export interface DownloadTransfer {
  signal: AbortSignal;
  progress: (loaded: number, total?: number) => void;
  end: () => void;
}

const PROGRESS_STEP_MS = 100;

const downloads = ref<DownloadProgress[]>([]);

let lastId = 0;

export function useDownloadProgress() {
  return { downloads };
}

export function trackDownload(filename: string): DownloadTransfer {
  const controller = new AbortController();
  const id = ++lastId;
  downloads.value.push({ id, filename, loaded: 0, cancel: () => controller.abort() });
  const entry = downloads.value.at(-1)!;
  let shownAt = 0;

  return {
    signal: controller.signal,
    progress(loaded, total) {
      const now = Date.now();
      if (now - shownAt < PROGRESS_STEP_MS) return;
      shownAt = now;
      entry.loaded = loaded;
      entry.total = total;
    },
    end() {
      downloads.value = downloads.value.filter((item) => item.id !== id);
    },
  };
}
