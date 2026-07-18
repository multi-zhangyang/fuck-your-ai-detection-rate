import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forwardedArgs = process.argv.slice(2);

if (!forwardedArgs.length) {
  process.stderr.write("Usage: node scripts/run_python.mjs <script.py> [...args]\n");
  process.exit(2);
}

const configuredPython = String(process.env.PYTHON || "").trim();
const candidates = [
  ...(configuredPython ? [{ command: configuredPython, prefix: [] }] : []),
  { command: resolve(ROOT_DIR, ".venv/bin/python"), prefix: [] },
  { command: resolve(ROOT_DIR, ".venv/Scripts/python.exe"), prefix: [] },
  ...(process.platform === "win32" ? [{ command: "py", prefix: ["-3"] }] : []),
  { command: "python3", prefix: [] },
  { command: "python", prefix: [] },
];

for (const candidate of candidates) {
  if (candidate.command.includes("/") || candidate.command.includes("\\")) {
    if (!existsSync(candidate.command)) continue;
  }
  const result = spawnSync(candidate.command, [...candidate.prefix, ...forwardedArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) {
    process.stderr.write(`Unable to start Python: ${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

process.stderr.write("Python 3 was not found. Install Python 3.10+ or create .venv in the project root.\n");
process.exit(127);
