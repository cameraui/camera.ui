import axios from 'axios';

function proxySessionQuery(): string {
  const token = useConnection().proxySession.value;
  return token ? `&session=${encodeURIComponent(token)}` : '';
}

export function isCancellationError(err: unknown): boolean {
  if (axios.isCancel(err)) return true;
  if (err instanceof Error) {
    const e = err as Error & { code?: string };
    if (e.code === 'ERR_CANCELED' || e.code === 'ECONNABORTED') return true;
    if (e.message === 'Request aborted' || e.message === 'canceled') return true;
  }
  return false;
}

export interface FormattedTimestamp {
  timestamp: number;
  formattedTime: string;
}

export function formatDate(date: number | Date, type = 'ddd., D. MMM. YY'): string {
  if (typeof date === 'number') {
    date = new Date(date);
  }

  return useDateFormat(date, type).value;
}

export function formatTimestamp(timestamp: number, hideSeconds?: boolean): FormattedTimestamp {
  let formattedTime = useDateFormat(timestamp, 'HH:mm:ss').value;

  if (hideSeconds) {
    formattedTime = useDateFormat(timestamp, 'HH:mm').value;
  }

  return {
    timestamp,
    formattedTime,
  };
}

export function formatRelativeTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const divisions: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  for (const [unit, secondsInUnit] of divisions) {
    if (Math.abs(seconds) >= secondsInUnit || unit === 'second') {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }

  return rtf.format(0, 'second');
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function getImageUrl(img: string = 'logo-512.png'): string {
  if (img.startsWith('data:') || img.startsWith('blob:') || img.startsWith('http:') || img.startsWith('https:')) {
    return img;
  }

  const authStore = useAuthStore();
  const connection = useConnection();
  const origin = connection.endpoint.value ?? location.origin;
  const token = connection.accessToken.value;

  if (img.startsWith(location.origin)) {
    return origin + img;
  }

  if (img === 'ERROR' || img === '') {
    img = 'logo-256.png';
  }

  if (img === 'avatar') {
    const avatar = authStore.user?.avatar;
    if (token && avatar) {
      return `${origin}/api/files/${avatar}?token=${token}${proxySessionQuery()}`;
    }
    img = 'logo-256.png';
  }

  if (img.includes('avatar')) {
    if (token) {
      return `${origin}/api/files/${img}?token=${token}${proxySessionQuery()}`;
    }
    img = 'logo-256.png';
  }

  const baseDir = '/src/assets/images';
  const avatarPath = `${baseDir}/${img}`;

  const imgUrls = import.meta.glob('/src/assets/**', { eager: true }) as Record<string, { default: string }>;

  if (imgUrls[avatarPath]) {
    return imgUrls[avatarPath].default as string;
  }

  return '';
}

export async function readImgUpload(event: InputEvent): Promise<string | undefined> {
  return new Promise((resolve) => {
    event.preventDefault();

    const fileList: FileList | null = (event.target as HTMLInputElement)?.files;

    if (fileList) {
      const file = fileList[0];
      const reader = new FileReader();

      if (file) {
        reader.onload = (event: ProgressEvent<FileReader>): void => {
          const base64ImgString = event.target?.result ? (event.target?.result as string) : undefined;
          resolve(base64ImgString);
        };

        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    }
  });
}

export function randomLetter(length: number = 10): string {
  const rnd = () => Math.floor(Math.random() * 25 + 10).toString(36);
  return Array.from({ length }, rnd).join('');
}

export function deepToRaw<T extends Record<string, any>>(obj: T, seen = new WeakMap()): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (seen.has(obj)) {
    return seen.get(obj);
  }

  if (Array.isArray(obj)) {
    const arr = [] as any[];
    seen.set(obj, arr);
    obj.forEach((item, index) => {
      arr[index] = deepToRaw(item, seen);
    });
    return arr as any;
  }

  const raw = {} as T;
  seen.set(obj, raw);
  Object.keys(obj).forEach((key) => {
    raw[key as keyof T] = deepToRaw(obj[key], seen);
  });

  return raw;
}

export function until(condition: () => boolean) {
  return {
    toBeTruthy: (timeout = 5000) =>
      new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          if (condition()) {
            resolve();
          } else if (Date.now() - start > timeout) {
            reject(new Error('Timeout waiting for condition'));
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      }),
  };
}

export function pluginMessageResponseTypeToToastType(type: 'error' | 'info' | 'success' | 'warning'): 'error' | 'info' | 'success' | 'warn' {
  switch (type) {
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    case 'success':
      return 'success';
    case 'warning':
      return 'warn';
    default:
      return 'info';
  }
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('inputmode', 'none');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  ta.style.fontSize = '12pt';
  document.body.appendChild(ta);

  ta.focus({ preventScroll: true });
  ta.select();
  ta.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  ta.remove();
  return ok;
}

export function copyToClipboardSync(text: string): boolean {
  if (!text) {
    return false;
  }

  const ok = legacyCopy(text);
  navigator.clipboard?.writeText(text).catch(() => {});
  return ok;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  const legacyOk = legacyCopy(text);

  let apiOk = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      apiOk = true;
    } catch {
      apiOk = false;
    }
  }

  return legacyOk || apiOk;
}

export function extractErrorMessage(error: unknown, fallback?: string): string {
  if (typeof error === 'object' && error !== null) {
    const responseData = (error as { response?: { data?: { message?: string } } }).response?.data;
    if (typeof responseData?.message === 'string') return responseData.message;
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
  }
  return fallback ?? String(error);
}
