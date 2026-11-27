import { WARM_WHITE_KELVIN } from '@/common/lightColor.js';

const WHITES = [
  { name: 'warm', kelvin: WARM_WHITE_KELVIN },
  { name: 'neutral', kelvin: 4000 },
  { name: 'cool', kelvin: 6500 },
];

export function whitesIn(range: { min: number; max: number }) {
  return WHITES.filter((white) => white.kelvin >= range.min && white.kelvin <= range.max);
}

export function isWhite(white: { kelvin: number }, kelvin: number): boolean {
  return Math.abs(white.kelvin - kelvin) < 100;
}
