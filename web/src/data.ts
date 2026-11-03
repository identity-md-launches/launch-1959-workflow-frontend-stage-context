import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  createPublicClient,
  http,
  erc20Abi,
  keccak256,
  decodeEventLog,
  encodeEventTopics,
  pad,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { Runtime } from "./config";
import type { GameWindow, Position } from "./model";
import { TICKET_PRICE, type WalletBet, type WindowRead } from "./mybets";
export function reader(r: Runtime) {
  return <T = unknown>(
    functionName: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
  ): Promise<T> =>
    r.client.readContract({
      address: r.game.address,
      abi: r.game.abi,
      functionName,
      args,
      blockNumber,
    }) as Promise<T>;
}
export async function verifyDeployment(r: Runtime) {
  const block = await r.client.getBlock();
  const [id, code, token, genesis] = await Promise.all([
    r.client.getChainId(),
    r.client.getCode({ address: r.game.address, blockNumber: block.number }),
    reader(r)<Address>("IMD", [], block.number),
    reader(r)<bigint>("GENESIS", [], block.number),
  ]);
  if (
    id !== 1 ||
    !code ||
    keccak256(code) !== r.game.runtimeCodeHash ||
    token.toLowerCase() !== r.token.address.toLowerCase() ||
    genesis !== 1791847200n
  )
    throw Error(
      "Live contract verification failed. Transactions are disabled.",
    );
  return true;
}
export const useVerification = (r: Runtime) =>
  useQuery({
    queryKey: ["verification"],
    queryFn: () => verifyDeployment(r),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
export async function loadGlobal(r: Runtime) {
  const block = await r.client.getBlock();
  const read = reader(r);
  const names = [
    "currentWindow",
    "earliestNotStartedWindow",
    "GENESIS",
    "line",
    "jackpotSeed",
    "jackpotInFlight",
    "jackpotOutstanding",
    "nextFinalizeWindow",
    "totalPendingJackpotDeposits",
  ] as const;
  const values = await Promise.all(
    names.map((n) => read<bigint>(n, [], block.number)),
  );
  const v = Object.fromEntries(names.map((n, i) => [n, values[i]])) as Record<
    (typeof names)[number],
    bigint
  >;
  return { ...v, blockNumber: block.number, timestamp: block.timestamp };
}
export type GlobalState = Awaited<ReturnType<typeof loadGlobal>>;
export const useGlobal = (r: Runtime) =>
  useQuery({
    queryKey: ["global"],
    queryFn: () => loadGlobal(r),
    refetchInterval: 15000,
    retry: 1,
  });
export const useWindow = (r: Runtime, k: bigint | undefined) =>
  useQuery({
    queryKey: ["window", k?.toString()],
    queryFn: async () => {
      const block = await r.client.getBlock();
      const read = reader(r);
      const [window, open] = await Promise.all([
        read<GameWindow>("windowInfo", [k], block.number),
        read<boolean>("isBettingOpen", [k], block.number),
      ]);
      return {
        window,
        open,
        blockNumber: block.number,
        timestamp: block.timestamp,
      };
    },
    enabled: k !== undefined,
    refetchInterval: 15000,
    retry: 1,
  });
export const useResults = (r: Runtime, g: GlobalState | undefined) =>
  useQuery({
    queryKey: ["results", g?.currentWindow.toString()],
    queryFn: async () => {
      // Derive the completed boundary from chain time, not a betting cursor.
      const completed =
        g!.timestamp > g!.GENESIS ? (g!.timestamp - g!.GENESIS) / 3600n : 0n;
      const ks = Array.from(
        { length: Number(completed < 24n ? completed : 24n) },
        (_, i) => completed - BigInt(i) - 1n,
      );
      return Promise.all(
        ks.map((k) => reader(r)<GameWindow>("windowInfo", [k], g!.blockNumber)),
      );
    },
    enabled: !!g,
    refetchInterval: 30000,
    retry: 1,
  });
export const useToken = (r: Runtime, account?: Address) =>
  useQuery({
    queryKey: ["token", account],
    queryFn: async () => {
      const block = await r.client.getBlock();
      const [balance, allowance] = await Promise.all(
        ["balanceOf", "allowance"].map(
          (fn) =>
            r.client.readContract({
              address: r.token.address,
              abi: erc20Abi,
              functionName: fn,
              args: fn === "balanceOf" ? [account] : [account, r.game.address],
              blockNumber: block.number,
            } as any) as Promise<bigint>,
        ),
      );
      return { balance, allowance };
    },
    enabled: !!account,
    refetchInterval: 15000,
    retry: 1,
  });
export interface GameEvent {
  eventName: string;
  args: Record<string, any>;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
}
const scanHeads = new Map<string, bigint>();
export async function loadEvents(r: Runtime, previous?: GameEvent[]) {
  const latest = await r.client.getBlockNumber().catch((error) => {
    logMyBetsReadError(r, "shared events: eth_blockNumber", error);
    throw error;
  });
  const prior = previous ?? [];
  const scanKey = `${r.chain.id}:${r.game.address.toLowerCase()}`;
  const head = previous ? scanHeads.get(scanKey) : undefined;
  let from =
    head !== undefined
      ? (head > latest ? latest : head) - 12n
      : BigInt(r.game.deploymentBlock);
  if (from < BigInt(r.game.deploymentBlock))
    from = BigInt(r.game.deploymentBlock);
  const output = prior.filter((e) => e.blockNumber < from);
  for (let start = from; start <= latest; start += 5000n) {
    const end = start + 4999n < latest ? start + 4999n : latest;
    const logs = await r.client
      .getLogs({
        address: r.game.address,
        fromBlock: start,
        toBlock: end,
      })
      .catch((error) => {
        logMyBetsReadError(r, "shared events: eth_getLogs", error, start, end);
        throw error;
      });
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: r.game.abi,
          data: log.data,
          topics: log.topics,
        });
        output.push({
          eventName: decoded.eventName!,
          args: decoded.args as any,
          transactionHash: log.transactionHash!,
          blockNumber: log.blockNumber!,
          logIndex: log.logIndex!,
        });
      } catch {
        /* Unknown logs are not gameplay. */
      }
    }
  }
  scanHeads.set(scanKey, latest);
  return output;
}
let cachedEvents: GameEvent[] | undefined;
export const useEvents = (r: Runtime) =>
  useQuery({
    queryKey: ["events"],
    queryFn: async () => (cachedEvents = await loadEvents(r, cachedEvents)),
    refetchInterval: 20000,
    retry: 1,
  });
export function usePositions(
  r: Runtime,
  account: Address | undefined,
  events: GameEvent[] | undefined,
) {
  const keys = [
    ...new Set(
      (events ?? [])
        .filter(
          (e) =>
            ["BinaryBet", "TicketBought"].includes(e.eventName) &&
            e.args.bettor?.toLowerCase() === account?.toLowerCase(),
        )
        .map((e) => String(e.args.k)),
    ),
  ];
  return useQuery({
    queryKey: ["positions", account, keys.join(",")],
    enabled: !!account && !!events,
    queryFn: async () => {
      const block = await r.client.getBlock();
      const read = reader(r);
      return Promise.all(
        keys.map(async (key) => {
          const k = BigInt(key);
          const [position, window, claimable, loss] = await Promise.all([
            read<Position>("position", [k, account], block.number),
            read<GameWindow>("windowInfo", [k], block.number),
            read<bigint>("claimable", [k, account], block.number),
            read<bigint>("lossOf", [k, account], block.number),
          ]);
          return { k, position, window, claimable, loss };
        }),
      );
    },
    refetchInterval: 15000,
    retry: 1,
  });
}

// ------------------------------------------------------------ My bets
// Reuse the complete shared events, including refunded and one-sided bets.
// This deliberately does not use leaderboard eligibility or volume totals.
export function walletEvents(events: GameEvent[], account: Address) {
  const wallet = account.toLowerCase();
  return events.filter((e) =>
    e.eventName === "Claimed"
      ? e.args.account?.toLowerCase() === wallet
      : (e.eventName === "BinaryBet" || e.eventName === "TicketBought") &&
        e.args.bettor?.toLowerCase() === wallet,
  );
}

function logMyBetsReadError(
  r: Runtime,
  step: string,
  error: unknown,
  from?: bigint,
  to = from,
) {
  // viem nests the HTTP request error under contract/action errors.
  let cause = error as { url?: string; cause?: unknown } | undefined;
  let rpcUrl: string | undefined;
  const seen = new Set<unknown>();
  while (cause && typeof cause === "object" && !seen.has(cause)) {
    seen.add(cause);
    rpcUrl ??= cause.url;
    cause = cause.cause as typeof cause;
  }
  console.error(
    "[My bets] Request failed",
    {
      step,
      rpcUrl: rpcUrl ?? r.deployment.network.rpcUrls,
      fromBlock: from?.toString() ?? "latest",
      toBlock: to?.toString() ?? "latest",
    },
    error,
  );
}

// Only used when the shared events query has failed. Every request is bounded
// before sending; retry the same chunk across the configured RPCs twice.
export async function loadWalletBets(r: Runtime, account: Address) {
  const clients = r.deployment.network.rpcUrls.map((url) => ({
    url,
    client: createPublicClient({
      chain: r.chain,
      transport: http(url, { timeout: 10000, retryCount: 0 }),
    }),
  }));
  let cursor = 0;
  async function request<T>(
    step: string,
    from: bigint | undefined,
    to: bigint | undefined,
    run: (client: (typeof clients)[number]["client"]) => Promise<T>,
  ): Promise<T> {
    let failure: unknown = Error("No game RPCs are configured.");
    for (let attempt = 0; attempt < clients.length * 2; attempt++) {
      const { url, client } = clients[cursor++ % clients.length];
      try {
        return await run(client);
      } catch (error) {
        failure = error;
        console.error(
          "[My bets] Fallback request failed",
          {
            step,
            rpcUrl: url,
            fromBlock: from?.toString() ?? "latest",
            toBlock: to?.toString() ?? "latest",
            attempt: attempt + 1,
          },
          error,
        );
      }
    }
    throw failure;
  }
  const latest = await request(
    "eth_blockNumber",
    undefined,
    undefined,
    (client) => client.getBlockNumber({ cacheTime: 0 }),
  );
  const selectors = ["BinaryBet", "TicketBought", "Claimed"].map(
    (eventName) =>
      encodeEventTopics({ abi: r.game.abi, eventName } as any)[0] as Hex,
  );
  const topics: [Hex[], null, Hex] = [
    selectors,
    null,
    pad(account.toLowerCase() as Hex),
  ];
  const events: GameEvent[] = [];
  for (
    let from = BigInt(r.game.deploymentBlock);
    from <= latest;
    from += 5000n
  ) {
    const to = from + 4999n < latest ? from + 4999n : latest;
    const logs = await request("eth_getLogs", from, to, (client) =>
      client.request({
        method: "eth_getLogs",
        params: [
          {
            address: r.game.address,
            fromBlock: toHex(from),
            toBlock: toHex(to),
            // All three events index k first and bettor/account second.
            topics,
          },
        ],
      }),
    );
    for (const log of logs) {
      try {
        const d = decodeEventLog({
          abi: r.game.abi,
          data: log.data,
          topics: log.topics,
        });
        events.push({
          eventName: d.eventName!,
          args: d.args as any,
          transactionHash: log.transactionHash!,
          blockNumber: BigInt(log.blockNumber!),
          logIndex: Number(log.logIndex!),
        });
      } catch (error) {
        console.error(
          "[My bets] Fallback log decoding failed",
          {
            step: "decodeEventLog",
            rpcUrl: clients[(cursor - 1) % clients.length].url,
            fromBlock: from.toString(),
            toBlock: to.toString(),
          },
          error,
        );
        throw error;
      }
    }
  }
  return walletEvents(events, account);
}

export function betsFromEvents(events: GameEvent[]) {
  const bets: WalletBet[] = [];
  const claimed = new Set<string>();
  for (const d of events) {
    if (d.eventName === "Claimed") {
      claimed.add(String(d.args.k));
      continue;
    }
    if (d.eventName !== "BinaryBet" && d.eventName !== "TicketBought") continue;
    bets.push({
      kind: d.eventName === "BinaryBet" ? "binary" : "ticket",
      k: BigInt(d.args.k),
      market: d.eventName === "BinaryBet" ? Number(d.args.market) : undefined,
      side: d.eventName === "BinaryBet" ? Boolean(d.args.side) : undefined,
      amount:
        d.eventName === "BinaryBet" ? BigInt(d.args.amount) : TICKET_PRICE,
      guess: d.eventName === "TicketBought" ? BigInt(d.args.guess) : undefined,
      transactionHash: d.transactionHash,
      blockNumber: d.blockNumber,
      logIndex: d.logIndex,
    });
  }
  return { bets, claimed };
}
export async function loadMyBets(
  r: Runtime,
  account: Address,
  events?: GameEvent[],
) {
  const { bets, claimed } = betsFromEvents(
    events === undefined
      ? await loadWalletBets(r, account)
      : walletEvents(events, account),
  );
  const block = await r.client.getBlock().catch((error) => {
    logMyBetsReadError(r, "getBlock for contract reads", error);
    throw error;
  });
  const contractRead = reader(r);
  const read = <T>(
    name: string,
    args: readonly unknown[],
    blockNumber: bigint,
  ) =>
    contractRead<T>(name, args, blockNumber).catch((error) => {
      logMyBetsReadError(r, `${name}(${args.join(", ")})`, error, blockNumber);
      throw error;
    });
  const ks = [...new Set(bets.map((b) => b.k.toString()))].map(BigInt);
  const [timeout, balance] = await Promise.all([
    read<bigint>("TIMEOUT", [], block.number),
    read<bigint>("balances", [account], block.number),
  ]);
  const reads: WindowRead[] = await Promise.all(
    ks.map(async (k) => {
      const [window, position, claimable, end, loss] = await Promise.all([
        read<GameWindow>("windowInfo", [k], block.number),
        read<Position>("position", [k, account], block.number),
        read<bigint>("claimable", [k, account], block.number),
        read<bigint>("windowEnd", [k], block.number),
        read<bigint>("lossOf", [k, account], block.number),
      ]);
      return {
        k,
        window,
        position,
        claimable,
        unlockAt: BigInt(end) + BigInt(timeout),
        loss,
        claimed: claimed.has(k.toString()),
      };
    }),
  );
  return {
    bets,
    reads,
    balance,
    timestamp: block.timestamp,
    blockNumber: block.number,
  };
}
export type SharedEvents = Pick<
  ReturnType<typeof useEvents>,
  "data" | "isError"
>;
export function useMyBets(
  r: Runtime,
  account: Address | undefined,
  events: SharedEvents,
) {
  // Game passes its existing query, so mounting this tab never starts a scan.
  const ownEvents = useMemo(
    () =>
      account && events.data !== undefined
        ? walletEvents(events.data, account)
        : undefined,
    [account, events.data],
  );
  const revision = ownEvents
    ?.map((e) => `${e.blockNumber}:${e.transactionHash}:${e.logIndex}`)
    .join(",");
  const query = useQuery({
    queryKey: [
      "my-bets",
      account?.toLowerCase(),
      r.chain.id,
      r.game.address,
      revision ?? "fallback",
    ],
    queryFn: () => loadMyBets(r, account!, ownEvents),
    // Pending events are not empty history and must not trigger the fallback.
    enabled: !!account && (ownEvents !== undefined || events.isError),
    refetchInterval: 20000,
    retry: 1,
  });
  return {
    ...query,
    waitingForEvents: ownEvents === undefined && !events.isError,
  };
}
