import { resolveTargets, runInPackages } from "./lib.js";

runInPackages(
  resolveTargets(["externals/plugins"]),
  ["npm run bundle --if-present"],
  {
    NODE_ENV: "development",
  },
);

runInPackages(
  resolveTargets(["plugins"]),
  ["npm run bundle:dev --if-present"],
  {
    NODE_ENV: "development",
  },
);
