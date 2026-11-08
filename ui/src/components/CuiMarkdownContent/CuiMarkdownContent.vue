<template>
  <div ref="root" class="w-full markdown-body" @click="scrollToAnchor" v-html="rendered"></div>
</template>

<script setup lang="ts">
import { alert } from '@mdit/plugin-alert';
import { footnote } from '@mdit/plugin-footnote';
import { tasklist } from '@mdit/plugin-tasklist';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

import type { CuiMarkdownContentProps } from './types.js';

const CHECK_ICON =
  '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 7.17 4.86 11.03 12.95 2.94"/></svg>';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerAliases(['javascript', 'js', 'jsx', 'mjs', 'cjs'], { languageName: 'typescript' });
hljs.registerAliases('shell', { languageName: 'bash' });

const md = MarkdownIt({
  linkify: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre><code class="hljs">' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
      } catch {
        /* ignore */
      }
    }
    return '<pre><code class="hljs">' + md.utils.escapeHtml(str) + '</code></pre>';
  },
})
  .use(alert, { titleRenderer: (tokens, idx) => `<p class="markdown-alert-title">${tokens[idx].markup}</p>\n` })
  .use(footnote)
  .use(tasklist, { label: false });

md.renderer.rules.checkbox_input = (tokens, idx) => {
  const checked = tokens[idx].attrGet('checked') !== null;
  return `<span class="markdown-checkbox" role="checkbox" aria-checked="${checked}" aria-disabled="true">${checked ? CHECK_ICON : ''}</span>`;
};

const renderLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return renderLinkOpen(tokens, idx, options, env, self);
};

const props = defineProps<CuiMarkdownContentProps>();

const rootRef = useTemplateRef<HTMLElement>('root');

const rendered = computed(() => md.render(props.content));

function scrollToAnchor(event: MouseEvent) {
  const href = (event.target as Element).closest('a')?.getAttribute('href');
  if (!href?.startsWith('#')) return;
  event.preventDefault();
  rootRef.value?.querySelector(`#${CSS.escape(href.slice(1))}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
</script>
