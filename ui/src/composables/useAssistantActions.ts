export interface AssistantUiAction {
  name: string;
  description: string;
  run: (args: Record<string, unknown>) => Promise<string> | string;
}

const actions = shallowReactive(new Map<string, AssistantUiAction>());

export function useAssistantActions() {
  function register(action: AssistantUiAction): void {
    actions.set(action.name, action);
    tryOnScopeDispose(() => {
      if (actions.get(action.name) === action) actions.delete(action.name);
    });
  }

  function list(): { name: string; description: string }[] {
    return Array.from(actions.values()).map(({ name, description }) => ({ name, description }));
  }

  async function run(name: string, args: Record<string, unknown>): Promise<string> {
    const action = actions.get(name);
    if (!action) throw new Error(`No action "${name}" on this page`);
    return action.run(args);
  }

  return { register, list, run };
}
