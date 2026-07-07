interface IconLink {
  el: HTMLLinkElement;
  href: string;
  type: string;
}

const BASE_ICON = '/pwa/favicon-64.ico';
const SIZE = 64;
const BADGE_COLOR = '#ea5455';
const BADGE_RADIUS = 14;

let iconLinks: IconLink[] | null = null;
let baseImagePromise: Promise<HTMLImageElement> | null = null;
let badgeDataUrl: string | null = null;
let badgeApplied = false;
let drawSeq = 0;

function collectIconLinks(): IconLink[] {
  iconLinks ??= Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')).map((el) => ({
    el,
    href: el.href,
    type: el.type,
  }));
  return iconLinks;
}

function loadBaseImage(): Promise<HTMLImageElement> {
  baseImagePromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${BASE_ICON}`));
    img.src = BASE_ICON;
  });
  return baseImagePromise;
}

function drawBadge(base: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(base, 0, 0, SIZE, SIZE);

  ctx.beginPath();
  ctx.arc(SIZE - BADGE_RADIUS - 1, SIZE - BADGE_RADIUS - 1, BADGE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = BADGE_COLOR;
  ctx.fill();

  return canvas.toDataURL('image/png');
}

export async function setFaviconBadge(unread: boolean): Promise<void> {
  if (typeof document === 'undefined') return;

  const seq = ++drawSeq;
  if (unread === badgeApplied) return;

  const links = collectIconLinks();
  if (links.length === 0) return;

  if (!unread) {
    badgeApplied = false;
    for (const { el, href, type } of links) {
      el.href = href;
      el.type = type;
    }
    return;
  }

  if (!badgeDataUrl) {
    try {
      badgeDataUrl = drawBadge(await loadBaseImage());
    } catch {
      return;
    }
  }
  if (!badgeDataUrl || seq !== drawSeq) return;

  badgeApplied = true;
  for (const { el } of links) {
    el.href = badgeDataUrl;
    el.type = 'image/png';
  }
}
