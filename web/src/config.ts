import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Abi,
  type Address,
} from "viem";
export interface Deployment {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    [key: string]: unknown;
  };
  walletAddChain?: Record<string, unknown>;
}
export const services = {
  /** Same-origin-friendly mirror of Squeekchain's live/status feeds and the wheel chat. */
  proxy: "https://hamster-hour.hamsterhour562.workers.dev",
  source: "https://sepolia.squeekchain.com",
  oracleAPI: "https://api.imd.fun",
  oracleExplorer: "https://explorer.imd.fun",
};
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const abiHash = (a: unknown) =>
  keccak256(toBytes(JSON.stringify(canonical(a)))).slice(2);
export async function loadRuntime() {
  const configURL = new URL("imd-deployment.json", document.baseURI);
  const response = await fetch(configURL, { cache: "no-cache" });
  if (!response.ok)
    throw Error("Deployment configuration could not load. Reload this page.");
  const d: Deployment = await response.json();
  const keys = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ];
  if (
    Object.keys(d).some((k) => !keys.includes(k)) ||
    d.version !== 1 ||
    !d.network ||
    d.chainId !== d.network.chainId ||
    !d.network.rpcUrls?.length ||
    d.contracts.length !== 2 ||
    !["HamsterHour", "OracleVerifier"].every((name) =>
      d.contracts.some((c) => c.name === name),
    )
  )
    throw Error(
      "Deployment configuration failed validation. Transactions are unavailable.",
    );
  if (d.network.rpcUrls.some((u) => !/^https:\/\//.test(u)))
    throw Error("Public HTTPS RPC configuration required.");
  const contracts = await Promise.all(
    d.contracts.map(async (c) => {
      if (
        !isAddress(c.address) ||
        !/^[a-zA-Z0-9_/-]+\.json$/.test(c.abiPath) ||
        c.abiPath.startsWith("/") ||
        c.abiPath.includes("..")
      )
        throw Error("Invalid contract configuration.");
      const r = await fetch(new URL(c.abiPath, configURL));
      if (!r.ok) throw Error("A deployed contract ABI could not load.");
      const abi: Abi = await r.json();
      if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash)
        throw Error(
          "Contract ABI verification failed. Transactions are unavailable.",
        );
      return { ...c, abi };
    }),
  );
  const chain = defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: {
      default: { name: d.network.name, url: d.network.explorer },
    },
    testnet: d.network.testnet,
  });
  const transport = () =>
    fallback(
      d.network.rpcUrls.map((url) =>
        http(url, { batch: { wait: 20 }, timeout: 10000, retryCount: 1 }),
      ),
      { rank: false, retryCount: 0 },
    );
  const client = createPublicClient({
    chain,
    transport: transport(),
    pollingInterval: 4000,
  });
  const wagmi = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: "Hamster Hour",
        appLogoUrl: new URL("favicon.svg", document.baseURI).href,
      }),
    ],
    transports: { [chain.id]: transport() },
  });
  return {
    deployment: d,
    chain,
    client,
    wagmi,
    game: contracts.find((c) => c.name === "HamsterHour")!,
    verifier: contracts.find((c) => c.name === "OracleVerifier")!,
  };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
