import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  copyFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "dist");
const checkOnly = process.argv.includes("--check");
const read = async (p) => JSON.parse(await readFile(resolve(root, p), "utf8"));
const handoff = await read("web/deployment/handoff.json");
const network = await read("web/deployment/network.json");
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
const canonicalString = (v) => JSON.stringify(canonical(v));
const hashABI = (abi) => keccak256(toBytes(canonicalString(abi))).slice(2);
const fail = (msg) => {
  throw Error(msg);
};
for (const [path, data] of [
  ["deployment.json", handoff],
  ["network.json", network],
]) {
  try {
    if (
      canonicalString(await read(".imd/reads/" + path)) !==
      canonicalString(data)
    )
      fail("Pinned " + path + " differs from build input");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const { version, launchId, chainId, sourceCommit, attestationHash } = handoff;
if (version !== 1 || chainId !== network.network.chainId)
  fail("Invalid deployment identity");
const manifest = {
  version,
  launchId,
  chainId,
  sourceCommit,
  attestationHash,
  contracts: [],
  assets: [],
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  ...network,
};
for (const contract of handoff.contracts) {
  const abiPath = `abi/${contract.name}.json`;
  const path = `docs/${abiPath}`;
  const pinned = execFileSync("git", ["show", `${sourceCommit}:${path}`], {
    cwd: root,
  });
  const local = await readFile(resolve(root, path));
  if (!local.equals(pinned)) fail(`${path} is not the pinned ABI export`);
  const abi = JSON.parse(pinned.toString());
  if (!Array.isArray(abi) || hashABI(abi) !== contract.abiHash)
    fail(`${contract.name} ABI hash mismatch`);
  if (!checkOnly) {
    await mkdir(resolve(dist, "abi"), { recursive: true });
    await copyFile(resolve(root, path), resolve(dist, abiPath));
  }
  if (
    hashABI(JSON.parse(await readFile(resolve(dist, abiPath), "utf8"))) !==
    contract.abiHash
  )
    fail("Export ABI mismatch");
  manifest.contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash: contract.abiHash,
    abiPath,
  });
}
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)],
      ),
    )
  ).flat();
let total = 0;
for (const file of (await walk(dist)).sort()) {
  const path = relative(dist, file).split("\\").join("/");
  if (path === "imd-deployment.json") continue;
  if (path.includes("..") || /(?:node_modules|\.map$|\.tgz$)/.test(path))
    fail("Unexpected export path: " + path);
  const bytes = await readFile(file);
  total += bytes.length;
  if (bytes.length > 8388608) fail("Asset over 8 MiB");
  manifest.assets.push({
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
if (manifest.assets.length > 128 || total > 20 * 1024 * 1024)
  fail("Export budget exceeded");
if (!manifest.assets.some((a) => a.path === "index.html"))
  fail("index.html missing");
if (checkOnly) {
  const actual = await read("dist/imd-deployment.json");
  if (canonicalString(actual) !== canonicalString(manifest))
    fail("Manifest fields or asset inventory mismatch");
} else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  JSON.stringify({
    verified: true,
    sourceCommit,
    contracts: manifest.contracts.map((c) => ({
      name: c.name,
      abiHash: c.abiHash,
    })),
    assets: manifest.assets.length,
    exportBytes: total,
  }),
);
