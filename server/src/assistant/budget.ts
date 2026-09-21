import { convertSchemaToJsonSchema, renderLazyCatalogEntry } from '@tanstack/ai';

import type { CoreTool } from './tools/shared.js';

const CHARS_PER_TOKEN = 3;
const OVERHEAD_SHARE = 0.35;
const CATALOG_SHARE = 0.5;
const ANSWER_RESERVE_TOKENS = 1_000;
const MIN_HISTORY_TOKENS = 2_000;
const HISTORY_SHARE = 0.8;
const LOAD_SKILL_TOKENS = 120;

const ENTRY_TOOLS = ['list_cameras', 'docs_search', 'list_tools', 'system_query', 'get_system_status', 'ask_user', 'api_search'];
const KEEP_EAGER = 4;
const ALWAYS_EAGER = ['show_report'];

export interface PromptSections {
  rules: string;
  toolless: string;
  capabilities: string;
  skills: string;
  skillCatalog: string;
  dynamic: string;
}

export interface RunPlan {
  window: number;
  toolless: boolean;
  skillsOnDemand: boolean;
  compactPrompt: boolean;
  catalogDescriptions: 'first-sentence' | 'none';
  eagerTools: Set<string>;
  hidden: string[];
  demoted: number;
  overheadTokens: number;
  historyTokens: number;
}

const costs = new WeakMap<object, { eager: number; catalog: number }>();

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function planRun(window: number, sections: PromptSections, tools: CoreTool[]): RunPlan {
  const allowance = Math.floor(window * OVERHEAD_SHARE);
  const plan: RunPlan = {
    window,
    toolless: tools.length === 0,
    skillsOnDemand: false,
    compactPrompt: false,
    catalogDescriptions: 'first-sentence',
    eagerTools: new Set(tools.filter((tool) => !tool.lazy).map((tool) => tool.name)),
    hidden: [],
    demoted: 0,
    overheadTokens: 0,
    historyTokens: 0,
  };

  if (plan.toolless) {
    plan.overheadTokens = estimateTokens(sections.toolless) + estimateTokens(sections.capabilities) + estimateTokens(sections.dynamic);
    plan.historyTokens = historyBudget(window, plan.overheadTokens);
    return plan;
  }

  const promptTokens = (): number =>
    estimateTokens(sections.rules) +
    estimateTokens(sections.dynamic) +
    (plan.compactPrompt ? 0 : estimateTokens(sections.capabilities)) +
    (plan.skillsOnDemand ? estimateTokens(sections.skillCatalog) + LOAD_SKILL_TOKENS : estimateTokens(sections.skills));

  const toolTokens = (): number =>
    tools.reduce((sum, tool) => {
      const cost = toolCost(tool);
      if (plan.eagerTools.has(tool.name)) return sum + cost.eager;
      return sum + (plan.catalogDescriptions === 'none' ? estimateTokens(tool.name) + 2 : cost.catalog);
    }, 0);

  const overhead = (): number => promptTokens() + toolTokens();

  if (overhead() > allowance) plan.skillsOnDemand = true;
  if (overhead() > allowance) plan.compactPrompt = true;
  if (overhead() > allowance) demoteTools(plan, tools, allowance - promptTokens());
  if (overhead() > window * CATALOG_SHARE) plan.catalogDescriptions = 'none';

  plan.hidden = plan.demoted ? tools.filter((tool) => !plan.eagerTools.has(tool.name)).map((tool) => tool.name) : [];
  plan.overheadTokens = overhead() + estimateTokens(plan.hidden.join(', '));
  plan.historyTokens = historyBudget(window, plan.overheadTokens);
  return plan;
}

export function promote(plan: RunPlan, tools: CoreTool[], names: string[]): void {
  for (const tool of tools) {
    if (!names.includes(tool.name) || plan.eagerTools.has(tool.name)) continue;
    plan.eagerTools.add(tool.name);
    plan.overheadTokens += toolCost(tool).eager;
  }
  plan.hidden = plan.hidden.filter((name) => !plan.eagerTools.has(name));
  plan.historyTokens = historyBudget(plan.window, plan.overheadTokens);
}

function historyBudget(window: number, overhead: number): number {
  return Math.max(MIN_HISTORY_TOKENS, Math.floor((window - overhead - ANSWER_RESERVE_TOKENS) * HISTORY_SHARE));
}

function demoteTools(plan: RunPlan, tools: CoreTool[], budget: number): void {
  const eager = tools.filter((tool) => plan.eagerTools.has(tool.name));
  const ranked = [...eager].sort((a, b) => rank(a) - rank(b));
  const catalogCost = (tool: CoreTool): number => (plan.catalogDescriptions === 'none' ? estimateTokens(tool.name) + 2 : toolCost(tool).catalog);
  const floor = tools.reduce((sum, tool) => sum + (plan.eagerTools.has(tool.name) ? catalogCost(tool) : toolCost(tool).catalog), 0);

  plan.eagerTools = new Set();
  let spent = floor;
  for (const [index, tool] of ranked.entries()) {
    const extra = toolCost(tool).eager - catalogCost(tool);
    const core = ALWAYS_EAGER.includes(tool.name) || (index < KEEP_EAGER && rank(tool) < ENTRY_TOOLS.length);
    if (!core && spent + extra > budget) continue;
    spent += extra;
    plan.eagerTools.add(tool.name);
  }
  plan.demoted = eager.length - plan.eagerTools.size;
}

function rank(tool: CoreTool): number {
  const entry = ENTRY_TOOLS.indexOf(tool.name);
  return entry === -1 ? ENTRY_TOOLS.length : entry;
}

function toolCost(tool: CoreTool): { eager: number; catalog: number } {
  const cached = costs.get(tool);
  if (cached) return cached;

  const description = tool.description ?? '';
  let schema = '';
  try {
    schema = JSON.stringify(convertSchemaToJsonSchema(tool.inputSchema));
  } catch {
    schema = '';
  }
  const cost = {
    eager: estimateTokens(`${tool.name}${description}${schema}`),
    catalog: estimateTokens(renderLazyCatalogEntry(tool.name, description, 'first-sentence')),
  };
  costs.set(tool, cost);
  return cost;
}
