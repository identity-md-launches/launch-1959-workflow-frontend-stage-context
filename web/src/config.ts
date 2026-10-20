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
  type Hex,
} from "viem";
export const services = {
  proxy: "https://hamster-hour.hamsterhour562.workers.dev",
  statsProxy: "https://hamster-hour.hamsterhour562.workers.dev",
  source: "https://sepolia.squeekchain.com",
};
export function canonical(v: unknown): unknown {
  return Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
}
export const abiHash = (abi: unknown) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
export interface Deployment {
  version: number;
  chainId: number;
  sourceCommit: string;
  repoUrl: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
    runtimeCodeHash: Hex;
    deploymentBlock: string;
  }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    pairToken: { address: Address; symbol: string; decimals: number };
  };
  walletAddChain: Record<string, unknown>;
}
export async function loadRuntime() {
  const url = new URL("imd-deployment.json", document.baseURI);
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok)
    throw Error("Game configuration could not load. Retry loading.");
  const d: Deployment = await response.json();
  const c = d.contracts?.find((x) => x.name === "HamsterHour");
  if (
    d.version !== 1 ||
    d.chainId !== 1 ||
    d.network.chainId !== 1 ||
    !c ||
    !isAddress(c.address) ||
    !d.network.rpcUrls.every((x) => x.startsWith("https://")) ||
    !/^abi\/[A-Za-z]+\.json$/.test(c.abiPath)
  )
    throw Error("Game configuration failed verification.");
  const res = await fetch(new URL(c.abiPath, url));
  if (!res.ok) throw Error("The game ABI could not load.");
  const abi: Abi = await res.json();
  if (abiHash(abi) !== c.abiHash) throw Error("Game ABI failed verification.");
  const chain = defineChain({
    id: 1,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: { default: { name: "Etherscan", url: d.network.explorer } },
  });
  const transport = () =>
    fallback(
      d.network.rpcUrls.map((url) =>
        http(url, { batch: { wait: 30 }, timeout: 10000, retryCount: 1 }),
      ),
      { rank: false, retryCount: 0 },
    );
  const client = createPublicClient({
    chain,
    transport: transport(),
    pollingInterval: 12000,
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
    game: { ...c, abi },
    token: d.network.pairToken,
  };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
