import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { toolError } from './shared.js';

import type { DocsIndex } from '../docs.js';
import type { CoreTool, ToolContext } from './shared.js';

export function createDocsTools(docs: DocsIndex): CoreTool[] {
  const docsSearch = toolDefinition({
    name: 'docs_search',
    description:
      'Search the camera.ui documentation: how a feature works, what it is called, where it lives in the app ' +
      '(adoption, zones, episodes, shares, workers, instances, backups, remote access, HomeKit, plugins, notifications, automations, users, two factor).',
    inputSchema: zod.object({
      query: zod.string().min(1).describe('A few English keywords, e.g. "export recording"'),
    }),
  }).server<ToolContext['context']>(({ query }) => {
    const hits = docs.search(query);
    if (!hits.length) return toolError(`The documentation has nothing for "${query}". Try other words.`);
    return hits;
  });

  const docsRead = toolDefinition({
    name: 'docs_read',
    lazy: true,
    description: 'Read a documentation page found with docs_search, whole or one section.',
    inputSchema: zod.object({
      page: zod.string().min(1).describe('Page path from docs_search, e.g. cameras/add-camera'),
      heading: zod.string().optional().describe('Heading of the section, omit for the whole page'),
    }),
  }).server<ToolContext['context']>(({ page, heading }) => {
    const result = docs.read(page, heading);
    if (!result) return toolError(`No documentation page "${page}". Use the page path from docs_search.`);
    return result;
  });

  return [docsSearch, docsRead];
}
