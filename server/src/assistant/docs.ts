import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '../services/config/index.js';

export interface DocsSection {
  page: string;
  title: string;
  heading: string;
  anchor: string;
  text: string;
}

export interface DocsHit {
  page: string;
  title: string;
  heading: string;
  url: string;
  snippet: string;
}

const DOCS_URL = 'https://docs.cameraui.com';
const SNIPPET_CHARS = 280;
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'you', 'your', 'can', 'how', 'what', 'does', 'not', 'camera', 'cameraui']);

interface IndexedSection extends DocsSection {
  terms: Map<string, number>;
  headTerms: Set<string>;
  length: number;
}

export class DocsIndex {
  private sections: IndexedSection[] = [];
  private df = new Map<string, number>();
  private avgLength = 1;

  public get size(): number {
    return this.sections.length;
  }

  public load(): void {
    const file = join(ConfigService.SERVER_PATH, 'assets', 'docs.json');
    if (!existsSync(file)) return;
    const raw = JSON.parse(readFileSync(file, 'utf8')) as DocsSection[];
    this.sections = raw.map((section) => {
      const terms = new Map<string, number>();
      for (const term of tokenize(`${section.title} ${section.heading} ${section.text}`)) terms.set(term, (terms.get(term) ?? 0) + 1);
      return { ...section, terms, headTerms: new Set(tokenize(`${section.title} ${section.heading}`)), length: section.text.length };
    });
    this.df.clear();
    for (const section of this.sections) for (const term of section.terms.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    this.avgLength = this.sections.reduce((sum, s) => sum + s.length, 0) / Math.max(1, this.sections.length);
  }

  public search(query: string, limit = 6): DocsHit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.sections.length) return [];

    const n = this.sections.length;
    const scored = this.sections
      .map((section) => {
        let score = 0;
        for (const term of terms) {
          const tf = section.terms.get(term);
          if (!tf) continue;
          const idf = Math.log(1 + (n - (this.df.get(term) ?? 0) + 0.5) / ((this.df.get(term) ?? 0) + 0.5));
          score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (section.length / this.avgLength))));
          if (section.headTerms.has(term)) score += idf;
        }
        return { section, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    const hits: DocsHit[] = [];
    for (const { section } of scored) {
      const key = `${section.page}#${section.anchor}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(toHit(section, snippet(section.text, terms)));
      if (hits.length >= limit) break;
    }
    return hits;
  }

  public read(page: string, heading?: string): { title: string; url: string; headings: string[]; text: string } | undefined {
    const normalized = page.replace(/^\/+|\/+$/g, '');
    const parts = this.sections.filter((section) => section.page === normalized);
    if (!parts.length) return undefined;

    const wanted = heading?.trim().toLowerCase();
    const chosen = wanted ? parts.filter((s) => s.heading.toLowerCase() === wanted || s.anchor === anchorOf(wanted)) : parts;
    const body = (chosen.length ? chosen : parts).map((s) => (s.heading === s.title ? s.text : `## ${s.heading}\n${s.text}`)).join('\n\n');
    return { title: parts[0].title, url: `${DOCS_URL}/${normalized}`, headings: [...new Set(parts.map((s) => s.heading))], text: body };
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
    .filter((word) => word.length > 1 && !STOP.has(word));
}

function anchorOf(heading: string): string {
  return heading
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0), Number.POSITIVE_INFINITY);
  const start = Number.isFinite(first) ? Math.max(0, lower.lastIndexOf('. ', first) + 1) : 0;
  const slice = text
    .slice(start, start + SNIPPET_CHARS)
    .replace(/\s+/g, ' ')
    .trim();
  return slice.length < text.length - start ? `${slice}…` : slice;
}

function toHit(section: DocsSection, text: string): DocsHit {
  return {
    page: section.page,
    title: section.title,
    heading: section.heading,
    url: `${DOCS_URL}/${section.page}${section.anchor ? `#${section.anchor}` : ''}`,
    snippet: text,
  };
}
