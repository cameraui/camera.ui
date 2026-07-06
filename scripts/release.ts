import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bump a package's version, commit it, tag `<pkg>-v<version>` and push. The
// release workflow (.github/workflows/release.yml) then builds and publishes it
// to npm with OIDC + provenance.
//
//   service -> camera.ui          tag service-v<version>
//   server  -> @camera.ui/server  tag server-v<version>
//
//   tsx scripts/release.ts server patch
//   tsx scripts/release.ts service 1.2.0
//   tsx scripts/release.ts server 1.2.0-beta.1 --yes

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PACKAGES = { service: 'service', server: 'server' } as const;
type PackageKey = keyof typeof PACKAGES;

const SEMVER = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|dev)\.\d+)?$/;

function fail(message: string): never {
  console.error('\r\n', chalk.bgRed.bold(' ERROR '), chalk.red(message));
  process.exit(1);
}

function usage(): never {
  console.log(
    [
      '',
      chalk.bold('Usage:') + ' tsx scripts/release.ts <service|server> <version|major|minor|patch> [--yes] [--skip-checks]',
      '',
      'Examples:',
      '  tsx scripts/release.ts server patch',
      '  tsx scripts/release.ts service 1.2.0',
      '  tsx scripts/release.ts server 1.2.0-beta.1 --yes',
      '',
      'Options:',
      '  --yes, -y       Push without the confirmation prompt.',
      '  --skip-checks   Skip the local pre-flight build (the workflow builds again anyway).',
      '',
    ].join('\r\n'),
  );
  process.exit(1);
}

function git(cmd: string, opts: { capture?: boolean } = {}): string {
  return execSync(`git ${cmd}`, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
    ?.toString()
    .trim();
}

function bump(current: string, spec: 'major' | 'minor' | 'patch'): string {
  const [major, minor, patch] = current.split('-')[0].split('.').map(Number);
  if ([major, minor, patch].some(Number.isNaN)) fail(`Cannot bump non-numeric version '${current}'.`);
  if (spec === 'major') return `${major + 1}.0.0`;
  if (spec === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const target = args[0] as PackageKey;
  const spec = args[1];
  const yes = args.includes('--yes') || args.includes('-y');
  const skipChecks = args.includes('--skip-checks');

  if (!target || !spec) usage();
  if (!(target in PACKAGES)) fail(`Unknown package '${target}' (expected 'service' or 'server').`);

  const pkgDir = resolve(ROOT, PACKAGES[target]);
  const pkgPath = resolve(pkgDir, 'package.json');
  if (!existsSync(pkgPath)) fail(`No ${PACKAGES[target]}/package.json found.`);

  // Safety: clean tree, not behind origin.
  if (git('status --porcelain', { capture: true })) fail('Working tree not clean - commit or stash first.');
  const branch = git('rev-parse --abbrev-ref HEAD', { capture: true });
  try {
    git(`fetch -q origin ${branch}`, { capture: true });
    if (git(`rev-list HEAD..origin/${branch}`, { capture: true })) fail(`Local ${branch} is behind origin/${branch} - pull first.`);
  } catch {
    // offline / no upstream tracking - skip the behind check
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const name: string = pkg.name;
  const current: string = pkg.version;

  const next = spec === 'major' || spec === 'minor' || spec === 'patch' ? bump(current, spec) : spec;
  if (!SEMVER.test(next)) fail(`Invalid version '${next}' (expected X.Y.Z or X.Y.Z-alpha|beta|dev.N).`);

  const tag = `${target}-v${next}`;
  try {
    git(`rev-parse ${tag}`, { capture: true });
    fail(`Tag ${tag} already exists.`);
  } catch {
    // tag does not exist - good
  }

  console.log(chalk.cyan(`\r\nReleasing ${chalk.bold(name)}: ${current} -> ${chalk.bold(next)} (tag ${tag})\r\n`));

  if (!skipChecks) {
    console.log(chalk.yellow(`Building ${name}...`));
    execSync(`npm --prefix "${pkgDir}" run build`, { cwd: ROOT, stdio: 'inherit' });
  }

  execSync(`npm --prefix "${pkgDir}" version ${next} --no-git-tag-version`, { cwd: ROOT, stdio: 'inherit' });

  git(`add "${PACKAGES[target]}/package.json"`);
  const lockPath = resolve(pkgDir, 'package-lock.json');
  if (existsSync(lockPath)) git(`add "${PACKAGES[target]}/package-lock.json"`);
  git(`commit -q -m "release(${target}): v${next}"`);
  console.log(chalk.green('Committed version bump.'));

  git(`tag ${tag}`);
  console.log(chalk.green(`Created tag ${tag}.`));

  if (!yes) {
    const ok = await confirm(`Push ${branch} + ${tag} and trigger the release? [y/N] `);
    if (!ok) {
      git(`tag -d ${tag}`, { capture: true });
      git('reset -q --hard HEAD~1', { capture: true });
      console.log(chalk.yellow('Aborted - tag and bump commit were undone locally.'));
      process.exit(0);
    }
  }

  git(`push -q origin ${branch}`);
  git(`push -q origin ${tag}`);
  console.log('\r\n', chalk.bgGreen(' SUCCESS '), chalk.green('Pushed. Watch the release workflow under the repo Actions tab.'));
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
