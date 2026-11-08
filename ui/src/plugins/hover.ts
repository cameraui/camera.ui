const HOVER_CLASS = 'cui-hover';
const HOVER_PSEUDO = /:hover(?![\w-])/g;
const GATED_HOVER = `:hover:where(.${HOVER_CLASS} *)`;

const gatedSheets = new WeakSet<CSSStyleSheet>();

let anyHover: MediaQueryList | undefined;

export function installHoverGate(): void {
  anyHover = window.matchMedia('(any-hover: hover)');
  setHover(anyHover.matches);

  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  document.addEventListener('load', gateStyleSheets, { capture: true });

  gateStyleSheets();
  new MutationObserver(gateStyleSheets).observe(document.head, { childList: true, subtree: true, characterData: true });
}

export function hoverActive(): boolean {
  return !anyHover || document.documentElement.classList.contains(HOVER_CLASS);
}

function setHover(on: boolean): void {
  document.documentElement.classList.toggle(HOVER_CLASS, on);
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'touch') setHover(false);
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && (event.movementX || event.movementY) && anyHover?.matches) setHover(true);
}

function gateStyleSheets(): void {
  for (const sheet of Array.from(document.styleSheets)) gateSheet(sheet);
}

function gateSheet(sheet: CSSStyleSheet): void {
  if (gatedSheets.has(sheet)) return;
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return;
  }
  gatedSheets.add(sheet);
  gateRules(rules);
}

function gateRules(rules: CSSRuleList): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule && rule.selectorText.includes(':hover') && !rule.selectorText.includes(HOVER_CLASS)) {
      rule.selectorText = rule.selectorText.replace(HOVER_PSEUDO, GATED_HOVER);
    }
    if (rule instanceof CSSImportRule && rule.styleSheet) gateSheet(rule.styleSheet);
    else if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) gateRules(rule.cssRules);
  }
}
