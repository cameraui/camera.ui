export function resolvePluginName(params: { scope?: string; pluginname: string }): string {
  if (params.scope) {
    const at = params.scope.startsWith('@') ? '' : '@';
    return `${at}${params.scope}/${params.pluginname}`;
  }
  return params.pluginname;
}
