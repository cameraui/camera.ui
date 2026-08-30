import extras from '@/assets/css/extras.css?inline';
import main from '@/assets/css/main.css?inline';
import markdown from '@/assets/css/markdown.css?inline';
import overrides from '@/assets/css/overrides.css?inline';
import tailwind from '@/assets/css/tailwind.css?inline';
import theme from '@/assets/css/theme.css?inline';
import transitions from '@/assets/css/transitions.css?inline';
import utils from '@/assets/css/utils.css?inline';

const APP_CSS = ['@layer theme, base, primevue, components, utilities;', tailwind, extras, main, markdown, overrides, theme, transitions, utils].join('\n');

function componentCss(): string {
  return typeof window.__CUI_HA_CSS__ === 'string' ? window.__CUI_HA_CSS__ : '';
}

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
const FONT_FILE = 'InterVariable.woff2?v=4.1';

let appSheet: CSSStyleSheet | null = null;
let fontSheet: CSSStyleSheet | null = null;
let primeSheet: CSSStyleSheet | null = null;
let mirrorQueued = false;

function sheets(): CSSStyleSheet[] {
  if (!appSheet) {
    appSheet = new CSSStyleSheet();
    appSheet.replaceSync(`${APP_CSS}\n${componentCss()}`.replace(FONT_FACE, ''));
  }
  if (!primeSheet) {
    primeSheet = new CSSStyleSheet();
    startPrimeMirror();
  }
  return [appSheet, primeSheet];
}

function mirrorPrime(): void {
  mirrorQueued = false;
  if (!primeSheet) return;
  const css = Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-primevue-style-id]'))
    .map((el) => el.textContent ?? '')
    .join('\n');
  try {
    primeSheet.replaceSync(css);
  } catch {
    // a half-written style block, the next mutation delivers the rest
  }
}

function startPrimeMirror(): void {
  mirrorPrime();
  const observer = new MutationObserver(() => {
    if (mirrorQueued) return;
    mirrorQueued = true;
    queueMicrotask(mirrorPrime);
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
}

export function ensureDocumentStyles(entryId: string): void {
  const [app] = sheets();
  if (!fontSheet) {
    fontSheet = new CSSStyleSheet();
    fontSheet.replaceSync(
      `@font-face{font-family:InterVariable;font-style:normal;font-weight:100 900;font-display:swap;src:url(/api/cameraui/cards/${entryId}/fonts/${FONT_FILE})format("woff2")}`,
    );
  }
  for (const sheet of [app!, fontSheet]) {
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
}

export function adoptStyles(root: ShadowRoot): void {
  const own = sheets();
  root.adoptedStyleSheets = [...root.adoptedStyleSheets.filter((s) => !own.includes(s)), ...own];
}
