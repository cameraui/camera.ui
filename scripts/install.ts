import { resolveTargets, runInPackages } from "./lib.js";

const commands = ["npm run install-updates --if-present"];
if (process.argv.includes("--with-build"))
  commands.push("npm run build --if-present");

runInPackages(resolveTargets(["service", "server", "ui"]), commands);
