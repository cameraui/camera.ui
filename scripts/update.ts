import { resolveTargets, runInPackages } from "./lib.js";

runInPackages(resolveTargets(["service", "server", "ui"]), [
  "npm run update --if-present",
]);
