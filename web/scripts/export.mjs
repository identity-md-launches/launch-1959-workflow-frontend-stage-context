import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "dist");
const check = process.argv.includes("--check");
const read = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const handoff = await read("web/deployment/handoff.json");
const network = await read("web/deployment/network.json");
const hash = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
if (
  handoff.chainId !== network.network.chainId ||
  handoff.contracts.length !== 1
)
  throw Error("Invalid v2 deployment");
for (const c of handoff.contracts) {
  const abi = await read(`web/contracts/${c.name}.json`);
  if (hash(abi) !== c.abiHash || !abi.some((x) => x.name === "windowInfo"))
    throw Error("v2 ABI integrity mismatch");
  if (!check) {
    await mkdir(resolve(dist, "abi"), { recursive: true });
    await copyFile(
      resolve(root, `web/contracts/${c.name}.json`),
      resolve(dist, c.abiPath),
    );
  }
  if (hash(await read(`dist/${c.abiPath}`)) !== c.abiHash)
    throw Error("Exported ABI mismatch");
}
const walk = async (d) =>
  (
    await Promise.all(
      (await readdir(d, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(resolve(d, e.name)) : [resolve(d, e.name)],
      ),
    )
  ).flat();
const assets = [];
let total = 0;
for (const file of (await walk(dist)).sort()) {
  const path = relative(dist, file);
  if (path === "imd-deployment.json") continue;
  if (/node_modules|\.tgz$|\.map$/.test(path))
    throw Error("Unnecessary export " + path);
  const b = await readFile(file);
  total += b.length;
  assets.push({ path, sha256: createHash("sha256").update(b).digest("hex") });
}
if (total > 4 * 1024 * 1024) throw Error("Static export exceeds 4 MiB budget");
const manifest = { ...handoff, ...network, assets };
if (check) {
  if (
    JSON.stringify(canonical(await read("dist/imd-deployment.json"))) !==
    JSON.stringify(canonical(manifest))
  )
    throw Error("Export inventory mismatch");
} else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  JSON.stringify({
    verified: true,
    sourceCommit: handoff.sourceCommit,
    contracts: handoff.contracts.map((x) => x.name),
    assets: assets.length,
    exportBytes: total,
  }),
);
