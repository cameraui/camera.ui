const LOCALHOST_PATTERN = /127\.0\.0\.1|localhost/g;

function rewriteUrl(url: string, masterAddress: string, rtspUsername?: string, rtspPassword?: string): string {
  let rewritten = url.replace(LOCALHOST_PATTERN, masterAddress);

  if (rtspUsername && rewritten.startsWith('rtsp://') && !rewritten.slice(7).split('/')[0].includes('@')) {
    rewritten = rewritten.replace('rtsp://', `rtsp://${rtspUsername}:${rtspPassword ?? ''}@`);
  }

  return rewritten;
}

function walk<T>(value: T, masterAddress: string, rtspUsername?: string, rtspPassword?: string): T {
  if (typeof value === 'string') {
    return rewriteUrl(value, masterAddress, rtspUsername, rtspPassword) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => walk(entry, masterAddress, rtspUsername, rtspPassword)) as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = walk(entry, masterAddress, rtspUsername, rtspPassword);
    }
    return result as T;
  }

  return value;
}

export function rewriteSourceUrlsForRemote<T>(urls: T): T {
  const masterAddress = process.env.CAMERAUI_MASTER_ADDRESS;
  if (!process.env.PLUGIN_REMOTE_MODE || !masterAddress) {
    return urls;
  }

  return walk(urls, masterAddress, process.env.CAMERAUI_RTSP_USERNAME, process.env.CAMERAUI_RTSP_PASSWORD);
}
