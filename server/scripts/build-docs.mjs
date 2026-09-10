import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = resolve(ROOT, '..', '..', 'docs');
const OUT = join(ROOT, 'dist', 'server', 'assets', 'docs.json');
const SKIP = new Set(['de', 'private', 'public', 'node_modules', '.vitepress']);
const MAX_SECTION_CHARS = 2500;

function pages(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pages(full));
    else if (entry.endsWith('.md') && entry !== 'README.md') out.push(full);
  }
  return out;
}

function pagePath(file) {
  return relative(DOCS, file)
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .replace(/(^|\/)index$/, '$1');
}

function clean(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^:::\s*\w*\s*(.*)$/gm, '$1')
    .replace(/^:::\s*$/gm, '')
    .replace(/`{3}[\s\S]*?`{3}/g, (block) => block.replace(/`{3}\w*\n?/g, ''))
    .replace(/`/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function sections(page, title, text) {
  const out = [];
  let heading = title;
  let buffer = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    buffer = [];
    if (!body) return;
    for (let i = 0; i < body.length; i += MAX_SECTION_CHARS) {
      out.push({ page, title, heading, anchor: heading === title ? '' : anchor(heading), text: body.slice(i, i + MAX_SECTION_CHARS) });
    }
  };
  for (const line of text.split('\n')) {
    const match = /^#{1,4}\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return out;
}

const index = [];
if (existsSync(DOCS)) {
  for (const file of pages(DOCS)) {
    const raw = readFileSync(file, 'utf8');
    const title = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? pagePath(file);
    index.push(...sections(pagePath(file), title, clean(raw)));
  }
} else {
  console.warn(`docs checkout not found at ${DOCS}, writing an empty assistant docs index`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(index));
console.log(`assistant docs index: ${index.length} sections from ${new Set(index.map((s) => s.page)).size} pages`);
