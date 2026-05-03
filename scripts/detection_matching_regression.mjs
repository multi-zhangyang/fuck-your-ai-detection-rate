import { spawnSync } from "node:child_process";

const python = process.env.PYTHON || "python";
const result = spawnSync(python, ["scripts/detection_matching_regression.py"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
