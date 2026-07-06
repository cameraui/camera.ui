# camera.ui Contributing Guide

Hi! I'm really excited that you're interested in contributing to camera.ui. Before submitting your contribution, please take a moment to read through the following guidelines:

- [Issue Reporting Guidelines](#issue-reporting-guidelines)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Development Setup](#development-setup)
- [Scripts](#scripts)
- [Project Structure](#project-structure)

## Issue Reporting Guidelines

- Always use the [issue templates](https://github.com/cameraui/camera.ui/issues/new/choose) when opening an issue. The issue list is **exclusively** for bug reports and feature requests.
- For support, questions, and camera requests, use [GitHub Discussions](https://github.com/cameraui/camera.ui/discussions/new/choose), [Discord](https://discord.gg/bBGnGcbz8N), or [Reddit](https://www.reddit.com/r/cameraui/) instead — support requests opened as issues will be converted to discussions.
- For security vulnerabilities, please do **not** open a public issue — follow the [Security Policy](./SECURITY.md) instead.
- Include your camera.ui version, deployment type (desktop app, Docker, Proxmox, bare-metal), relevant logs, and the steps that led to the problem. Issues without enough information to reproduce may be closed.

## Pull Request Guidelines

### What kinds of Pull Requests are accepted?

- **Bug fix.** If it solves a specific issue, reference it in the PR (e.g. `fix #123`). If it fixes something not yet reported, describe the bug and how to reproduce it in the PR.
- **New feature.** Please open a [feature request](https://github.com/cameraui/camera.ui/issues/new/choose) or a discussion **first** so I can give feedback on the approach before you invest time. Features that only serve a very specific setup may be better suited as a [plugin](https://docs.cameraui.com/plugins/).
- **Translations.** Fixes to existing languages and new languages are both welcome — see [i18n](#i18n) below.
- **Chores.** Typos, comment clarity, small cleanups.
- **Code refactors** without a concrete benefit (bug fix, measurable performance, objectively better maintainability) are generally discouraged — they cost review time and risk regressions.

### Pull Request Checklist

- Base your PR on the **default branch** and keep it **small and focused** — one concern per PR.
- Check the "Allow edits from maintainers" box so I can make small adjustments directly.
- Make sure lint, format, and type checks pass locally before pushing (see [Scripts](#scripts)).
- Avoid drive-by reformatting or unrelated changes — they bloat the diff and hide the actual change.
- There is no automated test suite in this repository yet, so please describe **how you verified your change** in the PR description (setup, steps, expected vs. actual behavior).
- Write clear, descriptive commit messages. There is no enforced commit convention — readability is what counts.

### i18n

All user-facing strings in the UI must go through i18n. The locale files live in [`ui/src/i18n/locales`](./ui/src/i18n/locales):

- Add new strings to **both** `en.ts` and `de.ts` — the German locale is type-checked against the English one, so a missing key breaks the build. If you can't translate a string, use the English text in `de.ts` and I'll translate it.
- New languages are welcome — copy `en.ts`, translate, and register the locale in `languages.ts`.

## Development Setup

You will need:

- **[Node.js](https://nodejs.org/)** v24 or newer and **git**
- **Python** 3.11 or newer — the server build runs `mypy` over the bundled Python plugin runtime
- **Go** — only if you work on Go-based plugin support

The setup script checks the prerequisites and tells you if something is missing.

```bash
# 1. Clone including submodules
git clone --recurse-submodules https://github.com/cameraui/camera.ui.git
cd camera.ui

# 2. Install dependencies for all packages and link the workspace
npm run setup

# 3. Build everything
npm run build
```

### Development workflow

Run the server and the web UI in two terminals:

```bash
# Terminal 1 — the camera.ui server, auto-restarts on changes
cd service && npm run watch

# Terminal 2 — the web UI with hot reload
cd ui && npm run dev
```

Then open the URL Vite prints. The `watch:alt` / `dev:alt` script variants run a second, isolated instance on different ports — useful for testing multi-instance and worker setups.

## Scripts

Run from the **repository root** (they apply to all packages):

| Script | What it does |
| --- | --- |
| `npm run setup` | Install dependencies everywhere, link the workspace, check prerequisites |
| `npm run build` | Build all packages (service, server, ui) |
| `npm run lint` | ESLint with auto-fix across the repo |
| `npm run format` | Prettier across the repo |

Per package:

| Script | Where | What it does |
| --- | --- | --- |
| `npm run watch` | `service/` | Run the server in dev mode (nodemon) |
| `npm run dev` | `ui/` | Vite dev server with HMR |
| `npm run type-check` | `ui/` | `vue-tsc` over the UI (also enforces locale key parity) |
| `npm run check` | `server/` | `tsc --noEmit` over the server |
| `npm run build` | `server/` | Full server build including `mypy` over the Python runtime |

## Project Structure

| Path | What it is |
| --- | --- |
| `service/` | The `camera.ui` npm package — a thin launcher/CLI that installs, updates, and runs the server |
| `server/` | The camera.ui server (Node.js / Fastify / TypeScript): API, streaming, recording, detection, plugin host |
| `ui/` | The web interface (Vue 3 / Vite / TypeScript), built into `server/dist/interface` |
| `externals/` | Git submodules for shared packages: `sdk`, `rpc`, `common`, `cli`, `plugins` |
| `scripts/` | Build, lint, format, and release tooling for the whole repo |

Changes to code under `externals/` belong in the respective repositories ([cameraui/sdk](https://github.com/cameraui/sdk), [cameraui/rpc](https://github.com/cameraui/rpc), [cameraui/common](https://github.com/cameraui/common), [cameraui/cli](https://github.com/cameraui/cli), [cameraui/plugins](https://github.com/cameraui/plugins)) — please open your PR there.

## Credits

Thank you to everyone who reports bugs, improves translations, writes plugins, and contributes code — camera.ui is better because of you.
