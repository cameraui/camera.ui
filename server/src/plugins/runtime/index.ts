import { GoPluginRuntime } from './go/index.js';
import { NodePluginRuntime } from './node/index.js';
import { PythonPluginRuntime } from './python/index.js';

import type { BasePluginRuntime, RuntimePlugin } from './base.js';

export class RuntimeFactory {
  static createRuntime(plugin: RuntimePlugin): BasePluginRuntime {
    if (plugin.isGo) {
      return new GoPluginRuntime(plugin);
    } else if (plugin.isPython) {
      return new PythonPluginRuntime(plugin);
    } else {
      return new NodePluginRuntime(plugin);
    }
  }
}
