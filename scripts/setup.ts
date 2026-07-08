import chalk from "chalk";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { platform } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, "..");
const IS_WINDOWS = platform() === "win32";

const SKIP_PLUGINS = process.argv.includes("--skip-plugins");
const PLUGINS_ONLY = process.argv.includes("--plugins-only");
const INSTALL_TOOLCHAINS = process.argv.includes("--install-toolchains");
const SKIP_PREREQS = process.argv.includes("--skip-prereqs");

const GLOBAL_PACKAGES = ["tsx", "@camera.ui/cli", "eslint", "prettier"];
const APP_DIRS = ["service", "server", "ui"];

const REQUIREMENTS = [
  "requirements.txt",
  join("server", "requirements.txt"),
  join("externals", "plugins", "requirements.txt"),
];

const PYTHON_LINKS: { from: string; name: string }[] = [
  {
    from: join("externals", "sdk", "python", "camera_ui_sdk"),
    name: "camera_ui_sdk",
  },
  {
    from: join("externals", "common", "python", "camera_ui_common"),
    name: "camera_ui_common",
  },
  {
    from: join("externals", "rpc", "python", "camera_ui_rpc"),
    name: "camera_ui_rpc",
  },
];
const PYTHON_LINK_TARGET = join("server", "src", "_camera_ui_tools");
const PLUGINS_SOURCE = join("externals", "plugins");
const LOCAL_PLUGINS_SOURCE = "plugins";
const PLUGINS_TARGET = join(".camera.ui", "plugins", "@camera.ui");
const SHARED_EXTERNALS = [join("externals", "cli"), join("externals", "sdk", "node")];

let stepNo = 0;
const step = (title: string) =>
  console.log(chalk.bold.cyan(`\n[${++stepNo}] ${title}`));
const info = (msg: string) => console.log(chalk.gray(`    ${msg}`));
const ok = (msg: string) => console.log(chalk.green(`    ✓ ${msg}`));
const warn = (msg: string) => console.log(chalk.yellow(`    ! ${msg}`));

function run(
  cmd: string,
  cwd: string = ROOT,
  env: NodeJS.ProcessEnv = process.env,
): void {
  info(`$ ${cmd}  (${cwd === ROOT ? "." : cwd.replace(`${ROOT}/`, "")})`);
  execSync(cmd, { stdio: "inherit", cwd, env });
}

function commandExists(cmd: string): boolean {
  try {
    execSync(IS_WINDOWS ? `where ${cmd}` : `command -v ${cmd}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function venvPython(): string {
  return IS_WINDOWS
    ? join(ROOT, ".venv", "Scripts", "python.exe")
    : join(ROOT, ".venv", "bin", "python");
}

function envWithVenv(): NodeJS.ProcessEnv {
  const binDir = IS_WINDOWS
    ? join(ROOT, ".venv", "Scripts")
    : join(ROOT, ".venv", "bin");
  return {
    ...process.env,
    VIRTUAL_ENV: join(ROOT, ".venv"),
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
  };
}

function ensureSymlink(target: string, linkPath: string): void {
  rmSync(linkPath, { recursive: true, force: true });
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath, IS_WINDOWS ? "junction" : "dir");
}

function checkPrerequisites(): void {
  step("Checking prerequisites");
  for (const [bin, label] of [
    ["git", "git"],
    ["node", "Node.js"],
    ["python3", "Python 3"],
  ] as const) {
    if (!commandExists(bin)) {
      throw new Error(
        `${label} is required but was not found on the PATH. Please install it and re-run "npm run setup".`,
      );
    }
    ok(`${label} found`);
  }
}

type Toolchain = "go" | "rust";

function toolchainInstallCmd(tool: Toolchain): string | null {
  const os = platform();
  if (tool === "rust") {
    if (os === "win32") return null; // see https://rustup.rs (rustup-init.exe)
    return "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y";
  }
  if (os === "darwin") return commandExists("brew") ? "brew install go" : null;
  if (os === "win32")
    return commandExists("winget") ? "winget install -e --id GoLang.Go" : null;
  if (commandExists("apt-get"))
    return "sudo apt-get update && sudo apt-get install -y golang";
  if (commandExists("dnf")) return "sudo dnf install -y golang";
  if (commandExists("pacman")) return "sudo pacman -S --noconfirm go";
  return null;
}

function toolchainDocs(tool: Toolchain): string {
  return tool === "rust" ? "https://rustup.rs" : "https://go.dev/dl/";
}

function checkOptionalToolchains(): void {
  step("Checking build toolchains (Go, Rust)");
  const tools = [
    { bin: "go", tool: "go" as const, label: "Go", note: "Go-based plugins" },
    {
      bin: "cargo",
      tool: "rust" as const,
      label: "Rust",
      note: "Rust plugins (nightly auto-selected via rust-toolchain.toml)",
    },
  ];

  for (const { bin, tool, label, note } of tools) {
    if (commandExists(bin)) {
      ok(`${label} found — for ${note}`);
      continue;
    }

    const cmd = toolchainInstallCmd(tool);
    if (INSTALL_TOOLCHAINS && cmd) {
      info(`${label} missing — installing...`);
      try {
        run(cmd);
        if (tool === "rust" && process.env.HOME) {
          const cargoBin = join(process.env.HOME, ".cargo", "bin");
          process.env.PATH = `${cargoBin}${delimiter}${process.env.PATH ?? ""}`;
        }
        ok(`${label} installed`);
      } catch {
        warn(`automatic ${label} install failed — install manually: ${toolchainDocs(tool)}`);
      }
      continue;
    }

    const how = cmd ?? toolchainDocs(tool);
    warn(
      `${label} not found (optional — needed to build ${note}). Install: ${how}` +
        (cmd && !INSTALL_TOOLCHAINS
          ? " — or re-run setup with --install-toolchains"
          : ""),
    );
  }
}

function installGlobalPackages(): void {
  step("Ensuring global CLI packages");

  let installed: Record<string, unknown> = {};
  try {
    const out = execSync("npm ls -g --depth=0 --json", {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    installed = (JSON.parse(out).dependencies as Record<string, unknown>) ?? {};
  } catch {
    // `npm ls` exits non-zero on peer-dep warnings but still prints JSON; ignore.
  }

  const missing = GLOBAL_PACKAGES.filter((pkg) => !(pkg in installed));
  if (missing.length === 0) {
    ok(`all present (${GLOBAL_PACKAGES.join(", ")})`);
    return;
  }

  info(`installing: ${missing.join(", ")}`);
  const installCmd = `npm install -g ${missing.join(" ")}`;
  try {
    run(installCmd);
  } catch (error) {
    if (IS_WINDOWS) throw error;
    warn("Global install failed (likely permissions) — retrying with sudo...");
    run(`sudo ${installCmd}`);
  }
  ok("global packages installed");
}

function initSubmodules(): void {
  step("Initializing git submodules");
  run("git submodule update --init --recursive");
  ok("submodules initialized");
}

function installNpmDependencies(): void {
  step("Installing npm dependencies");
  for (const dir of [".", ...APP_DIRS]) {
    const cwd = resolve(ROOT, dir);
    if (!existsSync(join(cwd, "package.json"))) {
      warn(`skipping ${dir} (no package.json)`);
      continue;
    }
    run("npm install --allow-scripts", cwd);
  }
  ok("dependencies installed (root, service, server, ui)");
}

function setupPythonEnv(): void {
  step("Setting up Python environment");

  const python = venvPython();
  if (!existsSync(python)) {
    info("creating virtualenv at .venv");
    run("python3 -m venv .venv");
    run(`"${python}" -m pip install --upgrade pip setuptools wheel`);
  } else {
    ok("virtualenv already present");
  }

  for (const req of REQUIREMENTS) {
    const reqPath = join(ROOT, req);
    if (!existsSync(reqPath)) {
      warn(`skipping ${req} (not found)`);
      continue;
    }
    run(`"${python}" -m pip install -r "${reqPath}"`);
  }
  ok("python dependencies installed (root, server, plugins)");
}

function linkPythonTools(): void {
  step("Linking Python sources into the server");
  for (const { from, name } of PYTHON_LINKS) {
    const target = join(ROOT, from);
    if (!existsSync(target)) {
      warn(
        `skipping ${name} (source missing: ${from} — are submodules initialized?)`,
      );
      continue;
    }
    ensureSymlink(target, join(ROOT, PYTHON_LINK_TARGET, name));
    ok(`${name} → ${from}`);
  }
}

function buildApp(): void {
  step("Building service, server & ui");
  // mypy (server build) lives in the virtualenv, so run builds with it on PATH.
  const env = envWithVenv();
  for (const dir of APP_DIRS) {
    run("npm run build --if-present", resolve(ROOT, dir), env);
  }
  ok("service, server & ui built");
}

function collectPlugins(): { name: string; path: string; local: boolean }[] {
  const out: { name: string; path: string; local: boolean }[] = [];

  const published = join(ROOT, PLUGINS_SOURCE);
  if (existsSync(published)) {
    for (const e of readdirSync(published, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith("camera-ui-"))
        out.push({ name: e.name, path: join(published, e.name), local: false });
    }
  }

  const local = join(ROOT, LOCAL_PLUGINS_SOURCE);
  if (existsSync(local)) {
    for (const e of readdirSync(local, { withFileTypes: true })) {
      if (existsSync(join(local, e.name, "package.json")))
        out.push({ name: e.name, path: join(local, e.name), local: true });
    }
  }

  return out;
}

function linkPlugins(): void {
  step("Linking plugins into the runtime");
  const plugins = collectPlugins();
  if (plugins.length === 0) {
    warn(
      "no plugins found (externals/plugins not initialized and no local plugins/)",
    );
    return;
  }
  // Rebuild the target dir so removed plugins don't linger.
  rmSync(join(ROOT, PLUGINS_TARGET), { recursive: true, force: true });
  for (const { name, path } of plugins)
    ensureSymlink(realpathSync(path), join(ROOT, PLUGINS_TARGET, name));
  const localCount = plugins.filter((p) => p.local).length;
  ok(
    `linked ${plugins.length} plugin(s) — ${plugins.length - localCount} published, ${localCount} local`,
  );
}

function installPluginPythonDeps(): void {
  step("Installing plugin Python dependencies");
  if (SKIP_PLUGINS) {
    warn("skipped (--skip-plugins)");
    return;
  }
  const python = venvPython();
  if (!existsSync(python)) {
    warn(
      "no .venv found — run a full setup first; skipping plugin python deps",
    );
    return;
  }

  const reqFiles: string[] = [];
  for (const base of [
    join(ROOT, PLUGINS_SOURCE),
    join(ROOT, LOCAL_PLUGINS_SOURCE),
  ]) {
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      const req = join(base, e.name, "requirements.txt");
      if (existsSync(req)) reqFiles.push(req);
    }
  }
  if (reqFiles.length === 0) {
    ok("no plugin requirements found");
    return;
  }

  let failures = 0;
  for (const req of reqFiles) {
    try {
      run(`"${python}" -m pip install -r "${req}"`);
    } catch {
      failures++;
      warn(
        `could not install deps for ${basename(dirname(req))} (native/platform dep unavailable?) — continuing`,
      );
    }
  }
  if (failures === 0) ok("plugin python dependencies installed");
  else warn(`${failures} plugin(s) had dependency install failures`);
}

function hasScript(dir: string, name: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return Boolean(pkg.scripts?.[name]);
  } catch {
    return false;
  }
}

function buildSharedExternals(env: NodeJS.ProcessEnv): void {
  info("building shared externals for local plugins (cli, sdk)");
  for (const rel of SHARED_EXTERNALS) {
    const dir = join(ROOT, rel);
    if (!existsSync(join(dir, "package.json"))) {
      warn(`skipping ${rel} (not initialized — run a full setup)`);
      continue;
    }
    try {
      run("npm ci --ignore-scripts", dir, env);
      run("npm run build", dir, env);
    } catch {
      warn(`could not build ${rel} — local plugins linking against it may fail`);
    }
  }
}

function bundlePlugins(): void {
  step("Installing & bundling plugins (dev)");
  if (SKIP_PLUGINS) {
    warn("skipped (--skip-plugins)");
    return;
  }
  const env = envWithVenv();

  const published = join(ROOT, PLUGINS_SOURCE);
  if (existsSync(join(published, "package.json"))) {
    run("npm run setup -- --skip-python", published, env);
    ok("published plugins installed & bundled");
  } else {
    warn("externals/plugins not initialized — skipping published plugins");
  }

  const local = join(ROOT, LOCAL_PLUGINS_SOURCE);
  if (existsSync(local)) {
    const dirs = readdirSync(local, { withFileTypes: true })
      .map((e) => join(local, e.name))
      .filter((dir) => existsSync(join(dir, "package.json")));

   if (dirs.some((dir) => !hasScript(dir, "setup"))) buildSharedExternals(env);

    for (const dir of dirs) {
      const name = basename(dir);
      try {
        if (hasScript(dir, "setup")) {
          run("npm run setup", dir, env);
        } else {
          run("npm install --allow-scripts", dir, env);
          run("npm run bundle:dev --if-present", dir, env);
        }
        ok(`local plugin bundled: ${name}`);
      } catch (error) {
        warn(
          `local plugin ${name} failed (continuing): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

function main(): void {
  console.log(chalk.bold.magenta("\ncamera.ui · setup\n"));
  console.log(chalk.gray(`root: ${ROOT}`));

  const prereqs: (() => void)[] = SKIP_PREREQS
    ? []
    : [checkPrerequisites, checkOptionalToolchains, installGlobalPackages];

  const steps: (() => void)[] = PLUGINS_ONLY
    ? [linkPlugins, installPluginPythonDeps, bundlePlugins]
    : [
        ...prereqs,
        initSubmodules,
        installNpmDependencies,
        setupPythonEnv,
        linkPythonTools,
        buildApp,
        linkPlugins,
        installPluginPythonDeps,
        bundlePlugins,
      ];

  if (PLUGINS_ONLY) info("plugins-only mode");
  if (SKIP_PREREQS && !PLUGINS_ONLY) info("skipping machine-level checks (--skip-prereqs)");

  try {
    for (const fn of steps) fn();
  } catch (error) {
    console.error(
      chalk.bgRed.bold("\n FAILED "),
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    console.error(
      chalk.gray(
        '\nFix the issue above and re-run "npm run setup" — it is safe to run repeatedly.',
      ),
    );
    process.exit(1);
  }

  console.log(
    chalk.bgGreen.bold("\n DONE "),
    chalk.green("camera.ui is set up and ready."),
  );
}

main();
