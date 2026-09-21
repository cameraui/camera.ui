import type { CoreTool } from './tools/shared.js';

const LENGTH_PENALTY = 0.15;
const SUFFIXES = ['ings', 'ing', 'ied', 'ies', 'ed', 'es', 's'];

// prettier-ignore
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'with', 'by', 'at', 'from', 'this', 'that', 'it', 'as',
  'what', 'which', 'when', 'where', 'who', 'how', 'do', 'does', 'did', 'you', 'your', 'me', 'my', 'can', 'will', 'not', 'any', 'all', 'its', 'their',
  'there', 'than', 'then', 'also', 'into', 'out', 'up', 'about', 'over', 'per', 'each', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'so', 'too', 'very', 'just', 'now', 'one', 'use', 'used', 'using', 'returns', 'return', 'list', 'lists',
]);

export function rankTools(query: string, tools: CoreTool[]): CoreTool[] {
  const wanted = new Set(words(query));
  const documents = tools.map((tool) => words(`${shortName(tool)} ${shortName(tool)} ${tool.description ?? ''}`));
  const spread = new Map<string, number>();
  for (const document of documents) for (const word of new Set(document)) spread.set(word, (spread.get(word) ?? 0) + 1);

  const scored = tools.map((tool, index) => {
    const counts = new Map<string, number>();
    for (const word of documents[index]) counts.set(word, (counts.get(word) ?? 0) + 1);

    let score = 0;
    for (const word of wanted) {
      const count = counts.get(word);
      if (count) score += (1 + Math.log(count)) * Math.log(1 + tools.length / (spread.get(word) ?? 1));
    }
    return { tool, score: score / (1 + LENGTH_PENALTY * Math.log(1 + documents[index].length)) };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}

function shortName(tool: CoreTool): string {
  return tool.name.split('__').pop() ?? tool.name;
}

function words(text: string): string[] {
  const found =
    text
      .toLowerCase()
      .replaceAll('_', ' ')
      .match(/[a-z]+/g) ?? [];
  return found.filter((word) => word.length > 2 && !STOP_WORDS.has(word)).map(stem);
}

function stem(word: string): string {
  const suffix = SUFFIXES.find((ending) => word.endsWith(ending) && word.length - ending.length >= 3);
  return suffix ? word.slice(0, -suffix.length) : word;
}
