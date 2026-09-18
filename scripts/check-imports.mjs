import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SUFFIXES = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".tmp",
  "test",
  "tests",
  "__pycache__",
]);
const BUILTINS = new Set(builtinModules);

const INTERNAL_PREFIXES = [
  ".",
  "/",
  "@/",
  "~",
  "@shared/",
  "virtual:",
  "node:",
  "bun:",
];

const IMPORT =
  /(?:^|[\s;{(=])(?:import|export)\s*(?:[\w*{},\s$]*?\s*from\s*)?["']([^"']+)["']|(?:import|require)\(\s*["']([^"']+)["']\s*\)/gm;

function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isTypeOnly(text, match, specifier) {
  const at = match.index + match[0].lastIndexOf(specifier);
  const lineStart = text.lastIndexOf("\n", at) + 1;
  return /^\s*(?:import|export)\s+type\b/.test(
    text.slice(lineStart, text.indexOf("\n", at)),
  );
}

async function sourceFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(full)));
    } else if (
      SOURCE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix)) &&
      !entry.name.includes(".test.")
    ) {
      found.push(full);
    }
  }

  return found;
}

async function check(packageDir) {
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const runtime = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const development = new Set(Object.keys(manifest.devDependencies ?? {}));

  const problems = new Map();
  const bareBuiltins = new Map();

  for (const file of await sourceFiles(join(packageDir, "src"))) {
    const text = readFileSync(file, "utf8");

    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (
        !specifier ||
        INTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix))
      ) {
        continue;
      }

      const name = packageOf(specifier);
      const where = relative(ROOT, file);

      if (BUILTINS.has(name)) {
        bareBuiltins.set(name, where);
        continue;
      }

      // a type import disappears when the file is compiled, devDependencies are fine there
      if (runtime.has(name) || isTypeOnly(text, match, specifier)) {
        continue;
      }

      const reason = development.has(name)
        ? "only in devDependencies"
        : "not declared at all";
      problems.set(`${name} (${reason})`, where);
    }
  }

  const label = relative(ROOT, packageDir) || manifest.name;
  if (problems.size === 0) {
    console.log(`${label}: every runtime import is declared`);
  } else {
    console.error(
      `${label}: ${problems.size} runtime import(s) that an install will not have`,
    );
    for (const [problem, where] of problems) {
      console.error(`  ${problem} — ${where}`);
    }
  }

  for (const [name, where] of bareBuiltins) {
    console.log(
      `${label}: note, "${name}" is imported without the node: prefix — ${where}`,
    );
  }

  return problems.size;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error(
    "usage: node scripts/check-imports.mjs <package-dir> [<package-dir>...]",
  );
  process.exit(2);
}

let failed = 0;
for (const target of targets) {
  failed += await check(resolve(ROOT, target));
}

process.exitCode = failed > 0 ? 1 : 0;
