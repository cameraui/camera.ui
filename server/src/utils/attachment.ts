export function attachmentHeader(filename: string): string {
  const plain = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const header = `attachment; filename="${plain}"`;
  if (plain === filename) return header;
  return `${header}; filename*=UTF-8''${encodeURIComponent(filename.toWellFormed()).replace(/['()*]/g, percentEncode)}`;
}

function percentEncode(char: string): string {
  return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
}
