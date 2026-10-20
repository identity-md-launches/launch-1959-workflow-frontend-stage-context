import { createPublicClient, http, type Address } from "viem";
import abi from "../contracts/HamsterHour.json";
import handoff from "../deployment/handoff.json";
import network from "../deployment/network.json";
// Additive API worker. Existing endpoint requests fall through to the unchanged legacy worker.
const LEGACY = "https://hamster-hour.hamsterhour562.workers.dev";
const game = handoff.contracts[0].address as Address;
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=15",
};
export const json = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    { status, headers },
  );
export async function windowSnapshot(
  client: ReturnType<typeof createPublicClient>,
) {
  const block = await client.getBlock();
  const read = (functionName: string, args: unknown[] = []) =>
    client.readContract({
      address: game,
      abi,
      functionName,
      args,
      blockNumber: block.number,
    }) as Promise<any>;
  const [currentK, nextK, seed, inFlight, outstanding, finalizeK] =
    await Promise.all(
      [
        "currentWindow",
        "earliestNotStartedWindow",
        "jackpotSeed",
        "jackpotInFlight",
        "jackpotOutstanding",
        "nextFinalizeWindow",
      ].map((n) => read(n)),
    );
  const [current, next, ...recent] = await Promise.all([
    read("windowInfo", [currentK]),
    read("windowInfo", [nextK]),
    ...Array.from({ length: Number(currentK < 24n ? currentK : 24n) }, (_, i) =>
      read("windowInfo", [currentK - BigInt(i) - 1n]),
    ),
  ]);
  const project = (w: any) => ({
    index: w.index,
    status: ["not-created", "open", "settled", "timed-out"][w.status],
    startsAt: w.startsAt,
    endsAt: w.endsAt,
    closesAt: w.closesAt,
    line: w.line,
    pools: { over: w.over, under: w.under, snoozeYes: w.yes, snoozeNo: w.no },
    tickets: w.tickets,
    result: w.status === 2 ? w.result : null,
    jackpotFinalized: w.jackpotFinalized,
    jackpotPot: w.jackpotPot,
    jackpotShare: w.jackpotShare,
  });
  return {
    schemaVersion: 1,
    chainId: 1,
    contract: game,
    token: network.network.pairToken.address,
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: block.timestamp,
    units: {
      timestamps: "unix seconds",
      amounts: "IMD base units, 18 decimals",
      passes: "integer",
    },
    current: project(current),
    next: project(next),
    line: next.line,
    pools: project(next).pools,
    closesAt: next.closesAt,
    jackpot: {
      carriedSeed: seed,
      inFlight,
      outstanding,
      nextFinalizeWindow: finalizeK,
      nextPendingDeposits: next.pendingJackpotDeposits,
      prizeFixed: next.jackpotFinalized,
      share: next.jackpotShare,
    },
    recentResults: recent.map(project),
  };
}
export function createHandler(
  deps: {
    fetch?: typeof fetch;
    client?: ReturnType<typeof createPublicClient>;
  } = {},
) {
  const fetcher = deps.fetch ?? fetch;
  return {
    async fetch(request: Request) {
      const url = new URL(request.url);
      if (["/live", "/status", "/rounds", "/chat"].includes(url.pathname)) {
        const upstream = new URL(url.pathname + url.search, LEGACY);
        return fetcher(new Request(upstream, request));
      }
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      if (!["/stats7", "/stats30", "/api/window"].includes(url.pathname))
        return json({ error: "not found" }, 404);
      if (request.method !== "GET")
        return json({ error: "method not allowed" }, 405);
      try {
        if (url.pathname === "/stats7" || url.pathname === "/stats30") {
          const range = url.pathname === "/stats7" ? "7d" : "30d";
          const response = await fetcher(
            `https://api.squeekchain.com/v1/measurement/stats?range=${range}`,
            {
              headers: { accept: "application/json" },
              signal: AbortSignal.timeout(12000),
            },
          );
          if (!response.ok)
            return json(
              {
                error: "telemetry unavailable",
                upstreamStatus: response.status,
              },
              502,
            );
          return json(await response.json());
        }
        let lastError: unknown;
        for (const rpc of network.network.rpcUrls) {
          try {
            return json(
              await windowSnapshot(
                deps.client ??
                  createPublicClient({
                    transport: http(rpc, { timeout: 10000, retryCount: 1 }),
                  }),
              ),
            );
          } catch (error) {
            lastError = error;
            if (deps.client) break;
          }
        }
        throw lastError;
      } catch {
        return json(
          { error: "Upstream data unavailable. Retry shortly." },
          503,
        );
      }
    },
  };
}
export default createHandler();
