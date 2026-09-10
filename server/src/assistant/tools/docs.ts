import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { toolError } from './shared.js';

import type { DocsIndex } from '../docs.js';
import type { CoreTool, ToolContext } from './shared.js';

export function createDocsTools(docs: DocsIndex): CoreTool[] {
  const docsSearch = toolDefinition({
    name: 'docs_search',
    description:
      'Search the camera.ui user documentation. Use it to learn how a feature works, what it is called and where it lives in the app ' +
      '(discovery and adoption, zones, episodes, shares, workers, instances, backups, remote access, plugins, notifications, automations). ' +
      'Call it before you claim that something does not exist or cannot be done. Query in English, a few keywords.',
    inputSchema: zod.object({
      query: zod.string().min(1).describe('Keywords in English, e.g. "discover camera adopt", "export recording", "two factor"'),
    }),
  }).server<ToolContext['context']>(({ query }) => {
    const hits = docs.search(query);
    if (!hits.length) return toolError(`The documentation has nothing for "${query}". Try other words.`);
    return hits;
  });

  const docsRead = toolDefinition({
    name: 'docs_read',
    description: 'Read a documentation page or one of its sections found with docs_search. Pass the page path, optionally a heading.',
    inputSchema: zod.object({
      page: zod.string().min(1).describe('Page path from docs_search, e.g. cameras/add-camera'),
      heading: zod.string().optional().describe('Section heading to read, omit for the whole page'),
    }),
  }).server<ToolContext['context']>(({ page, heading }) => {
    const result = docs.read(page, heading);
    if (!result) return toolError(`No documentation page "${page}". Use the page path from docs_search.`);
    return result;
  });

  return [docsSearch, docsRead];
}
