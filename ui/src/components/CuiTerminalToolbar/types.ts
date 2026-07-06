export interface TerminalKey {
  id: string;
  label: string;
  sequence: string;
  modifier?: boolean;
  width?: number;
}

export interface CuiTerminalToolbarProps {
  visibleKeys?: string[];
}

export interface CuiTerminalToolbarEmits {
  (e: 'send', data: string): void;
}

export const DEFAULT_KEYS: TerminalKey[] = [
  { id: 'esc', label: 'Esc', sequence: '\x1b' },
  { id: 'tab', label: 'Tab', sequence: '\t' },
  { id: 'ctrl', label: 'Ctrl', sequence: '', modifier: true },
  { id: 'alt', label: 'Alt', sequence: '', modifier: true },
  { id: 'home', label: 'Home', sequence: '\x1b[H' },
  { id: 'end', label: 'End', sequence: '\x1b[F' },
  { id: 'up', label: '↑', sequence: '\x1b[A' },
  { id: 'down', label: '↓', sequence: '\x1b[B' },
  { id: 'left', label: '←', sequence: '\x1b[D' },
  { id: 'right', label: '→', sequence: '\x1b[C' },
  { id: 'pgup', label: 'PgUp', sequence: '\x1b[5~' },
  { id: 'pgdn', label: 'PgDn', sequence: '\x1b[6~' },
  { id: 'del', label: 'Del', sequence: '\x1b[3~' },
  { id: 'slash', label: '/', sequence: '/' },
  { id: 'dash', label: '-', sequence: '-' },
  { id: 'pipe', label: '|', sequence: '|' },
  { id: 'tilde', label: '~', sequence: '~' },
  { id: 'underscore', label: '_', sequence: '_' },
];

export const DEFAULT_VISIBLE_KEYS: string[] = ['tab', 'ctrl', 'up', 'down', 'left', 'right'];

export const CTRL_MAP: Record<string, string> = {
  a: '\x01',
  b: '\x02',
  c: '\x03',
  d: '\x04',
  e: '\x05',
  f: '\x06',
  g: '\x07',
  h: '\x08',
  i: '\x09',
  j: '\x0A',
  k: '\x0B',
  l: '\x0C',
  m: '\x0D',
  n: '\x0E',
  o: '\x0F',
  p: '\x10',
  q: '\x11',
  r: '\x12',
  s: '\x13',
  t: '\x14',
  u: '\x15',
  v: '\x16',
  w: '\x17',
  x: '\x18',
  y: '\x19',
  z: '\x1A',
};
