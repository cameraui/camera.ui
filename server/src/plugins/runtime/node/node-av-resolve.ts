import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const NODE_AV_SPECIFIER = /^node-av(?:-lgpl|-light)?(\/.*)?$/;

export function forceServerNodeAv(): void {
  const serverRequire = createRequire(import.meta.url);
  let resolving = false;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      const match = resolving ? null : NODE_AV_SPECIFIER.exec(specifier);
      if (!match) {
        return nextResolve(specifier, context);
      }

      resolving = true;
      try {
        return { url: pathToFileURL(serverRequire.resolve(`node-av${match[1] ?? ''}`)).href, shortCircuit: true };
      } finally {
        resolving = false;
      }
    },
  });
}
