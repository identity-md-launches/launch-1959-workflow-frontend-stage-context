// Build a temporary checkout without writing repository node_modules or changing protected locks.
import { mkdtemp, cp, rm, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = await mkdtemp("/tmp/hamster-hour-build-");
await cp(resolve(root, "web"), resolve(temporary, "web"), {
  recursive: true,
  filter: (p) => !p.split("/").includes("node_modules"),
});
execFileSync(
  "npm",
  [
    "ci",
    "--legacy-peer-deps",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    resolve(temporary, "npm-cache"),
  ],
  { cwd: resolve(temporary, "web"), stdio: "inherit" },
);
execFileSync("npm", ["run", "build"], {
  cwd: resolve(temporary, "web"),
  stdio: "inherit",
});
execFileSync("node", ["scripts/build-worker.mjs"], {
  cwd: resolve(temporary, "web"),
  stdio: "inherit",
});
await rm(resolve(root, "dist"), { recursive: true, force: true });
await cp(resolve(temporary, "dist"), resolve(root, "dist"), {
  recursive: true,
});
await mkdir(resolve(root, "worker"), { recursive: true });
await copyFile(
  resolve(temporary, "worker/worker.mjs"),
  resolve(root, "worker/worker.mjs"),
);
console.log(
  `Production export rebuilt from a temporary install. Temporary project: ${temporary}`,
);
