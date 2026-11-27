export function shortNames(names: string[]): string[] {
  const words = names.map((name) => name.split(' '));
  let shared = 0;
  while (words.length > 1 && words.every((parts) => parts.length > shared + 1 && parts[shared] === words[0][shared])) shared += 1;
  return words.map((parts) => parts.slice(shared).join(' '));
}
