import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_NAMES = ["vitest", "vite", "rolldown", "lightningcss"];
const REQUIRED_OS = ["linux", "darwin", "win32"];

const cwd = process.cwd();
const pkgPath = join(cwd, "package.json");
const lockPath = join(cwd, "package-lock.json");
const shrinkwrapPath = join(cwd, "npm-shrinkwrap.json");

function npm(args) {
  execFileSync("npm", args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function entryName(key) {
  const marker = "node_modules/";
  const index = key.lastIndexOf(marker);
  return index === -1 ? key : key.slice(index + marker.length);
}

// An override of the form "$name" points at the package's own dependency entry,
// so npm rejects it once that entry is gone with devDependencies.
function danglingOverrides(pkg) {
  const dependencies = pkg.dependencies ?? {};
  return Object.entries(pkg.overrides ?? {})
    .filter(([key, value]) => {
      if (typeof value !== "string" || !value.startsWith("$")) return false;
      const target = value.slice(1) || key;
      return !(target in dependencies);
    })
    .map(([key]) => key);
}

function productionPackage(pkg, dangling) {
  const result = { ...pkg };
  delete result.devDependencies;

  if (result.overrides) {
    const overrides = { ...result.overrides };
    for (const key of dangling) delete overrides[key];
    if (Object.keys(overrides).length > 0) result.overrides = overrides;
    else delete result.overrides;
  }

  return result;
}

function aliasTarget(value) {
  const spec = value.slice("npm:".length);
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

function checkOverrides(pkg, dangling, entries, errors) {
  for (const [name, value] of Object.entries(pkg.overrides ?? {})) {
    if (dangling.includes(name)) continue;

    const matches = entries.filter(([key]) => entryName(key) === name);
    const versions = [...new Set(matches.map(([, entry]) => entry.version))];

    if (versions.length === 0) {
      errors.push(`override "${name}": not in the tree`);
      continue;
    }
    if (versions.length > 1) {
      errors.push(
        `override "${name}": ${versions.join(", ")} in the tree, the override did not apply`,
      );
    }
    if (typeof value === "string" && value.startsWith("npm:")) {
      const target = aliasTarget(value);
      const aliased = matches.every(([, entry]) => entry.name === target);
      if (!aliased) {
        errors.push(`override "${name}": not aliased to ${target}`);
      }
    }
  }
}

function checkPlatforms(entries, errors) {
  const platforms = new Set();
  for (const [, entry] of entries) {
    for (const value of entry.os ?? []) platforms.add(value);
  }
  if (platforms.size === 0) return;

  for (const value of REQUIRED_OS) {
    if (!platforms.has(value)) {
      errors.push(`no platform package for ${value}`);
    }
  }
}

function reportDrift(entries, lockText) {
  if (!lockText) return;

  const locked = JSON.parse(lockText).packages ?? {};
  const drifted = entries.filter(([key, entry]) => {
    const before = locked[key];
    return before && before.version !== entry.version;
  });

  if (drifted.length > 0) {
    console.log(
      `shrinkwrap: ${drifted.length} of ${entries.length} packages differ from package-lock.json`,
    );
    for (const [key, entry] of drifted.slice(0, 10)) {
      console.log(
        `  ${entryName(key)} ${locked[key].version} -> ${entry.version}`,
      );
    }
  }
}

function verify(pkg, dangling, lockText) {
  const shrinkwrap = JSON.parse(readFileSync(shrinkwrapPath, "utf8"));
  const packages = shrinkwrap.packages ?? {};
  const entries = Object.entries(packages).filter(([key]) => key !== "");
  const errors = [];

  if (entries.length === 0) errors.push("no packages in the shrinkwrap");
  if (packages[""]?.devDependencies) {
    errors.push("the root entry still carries devDependencies");
  }

  for (const [key, entry] of entries) {
    if (entry.dev) errors.push(`${key} is flagged dev`);
    if (entry.devOptional) errors.push(`${key} is flagged devOptional`);
    if (FORBIDDEN_NAMES.includes(entryName(key))) {
      errors.push(`${key} must not be in a production tree`);
    }
  }

  checkOverrides(pkg, dangling, entries, errors);
  checkPlatforms(entries, errors);

  if (errors.length === 0) {
    reportDrift(entries, lockText);
    console.log(`shrinkwrap: ${entries.length} production packages pinned`);
  }

  return errors;
}

function create() {
  const pkgText = readFileSync(pkgPath, "utf8");
  const lockText = existsSync(lockPath)
    ? readFileSync(lockPath, "utf8")
    : undefined;
  const pkg = JSON.parse(pkgText);
  const dangling = danglingOverrides(pkg);
  let errors = ["shrinkwrap was not generated"];

  try {
    writeFileSync(
      pkgPath,
      `${JSON.stringify(productionPackage(pkg, dangling), null, 2)}\n`,
    );
    npm([
      "install",
      "--omit=dev",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ]);
    npm(["shrinkwrap"]);
    errors = verify(pkg, dangling, lockText);
  } finally {
    writeFileSync(pkgPath, pkgText);
    if (lockText !== undefined) writeFileSync(lockPath, lockText);
  }

  if (errors.length > 0) {
    cleanup();
    console.error("shrinkwrap check failed:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}

function cleanup() {
  rmSync(shrinkwrapPath, { force: true });
}

const mode = process.argv[2];

if (mode === "create") {
  create();
} else if (mode === "cleanup") {
  cleanup();
} else {
  console.error("usage: node ../scripts/shrinkwrap.mjs <create|cleanup>");
  process.exit(1);
}
