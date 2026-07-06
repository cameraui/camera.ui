import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = platform() === "win32";

const TARGET = join(ROOT, "server", "src", "_camera_ui_tools");
const LINKS = [
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

mkdirSync(TARGET, { recursive: true });
writeFileSync(join(TARGET, "__init__.py"), "");

let missing = false;
for (const { from, name } of LINKS) {
  const src = join(ROOT, from);
  if (!existsSync(src)) {
    console.error(
      `  missing: ${from} — initialize submodules (git submodule update --init --recursive)`,
    );
    missing = true;
    continue;
  }
  const linkPath = join(TARGET, name);
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(src, linkPath, IS_WINDOWS ? "junction" : "dir");
  console.log(`  linked ${name} -> ${from}`);
}

if (missing) {
  console.error(
    "\nCould not assemble _camera_ui_tools: some Python sources are missing.",
  );
  process.exit(1);
}
console.log("\n_camera_ui_tools assembled.");
