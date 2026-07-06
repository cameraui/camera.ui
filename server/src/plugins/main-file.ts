import type { IPackageJson } from '../api/types/index.js';

export function resolvePluginMain(packageJSON: IPackageJson): string {
  let main: string | undefined;

  if (packageJSON.exports) {
    if (typeof packageJSON.exports === 'string') {
      main = packageJSON.exports;
    } else {
      const exports = packageJSON.exports.import ?? packageJSON.exports.require ?? packageJSON.exports.node ?? packageJSON.exports.default ?? packageJSON.exports['.'];

      if (typeof exports !== 'string') {
        if (exports.import) {
          main = exports.import;
        } else {
          main = exports.require ?? exports.node ?? exports.default;
        }
      } else {
        main = exports;
      }
    }
  }

  return main ?? packageJSON.main ?? './index.js';
}
