import chalk from "chalk";
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv"]);

export function findPackages(dir: string): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    if (existsSync(resolve(current, "package.json"))) {
      found.push(current);
      return;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !SKIP_DIRS.has(entry.name)
      ) {
        walk(resolve(current, entry.name));
      }
    }
  };

  walk(dir);
  return found;
}

export function resolveTargets(defaults: string[]): string[] {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const sources = args.length > 0 ? args : defaults;

  const targets: string[] = [];
  for (const source of sources) {
    const abs = resolve(ROOT, source);
    if (!existsSync(abs)) {
      console.warn(chalk.yellow(`! skipping "${source}" (not found)`));
      continue;
    }
    if (existsSync(resolve(abs, "package.json"))) {
      targets.push(abs);
    } else {
      targets.push(...findPackages(abs));
    }
  }
  return targets;
}

export function runInPackages(
  targets: string[],
  commands: string[],
  env?: NodeJS.ProcessEnv,
): void {
  if (targets.length === 0) {
    console.log(chalk.yellow("No target packages found — nothing to do."));
    return;
  }

  let failures = 0;
  for (const dir of targets) {
    try {
      for (const cmd of commands) {
        console.log(chalk.cyan("USER:", userInfo().username));
        console.log(chalk.cyan("DIR:", dir));
        console.log(chalk.cyan(`COMMAND: ${cmd}\r\n`));
        execSync(cmd, {
          stdio: "inherit",
          cwd: dir,
          env: { ...process.env, ...env },
        });
        console.log("\r\n");
      }
      console.log(
        "\r\n",
        chalk.bgGreen(" SUCCESS "),
        chalk.green(`Command completed in ${dir}`),
      );
    } catch (error) {
      failures++;
      console.error(
        "\r\n",
        chalk.bgRed.bold(" ERROR "),
        chalk.red(
          `Failed in ${dir}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    } finally {
      console.log("\r\n----------------------------------------\r\n");
    }
  }

  console.log(
    failures === 0
      ? chalk.green("All commands completed")
      : chalk.yellow(`Completed with ${failures} failure(s)`),
  );
}
