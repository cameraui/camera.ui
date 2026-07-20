export function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  return value;
}

export function looseEquals(a: string, b: string): boolean {
  if (a === b) return true;
  return parseValue(a.trim()) === parseValue(b.trim());
}

export function toComparableNumber(value: string): number {
  return value.trim() === '' ? NaN : Number(value);
}
