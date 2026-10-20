import { useQuery } from "@tanstack/react-query";
import { erc20Abi, keccak256, decodeEventLog, type Address } from "viem";
import type { Runtime } from "./config";
import type { GameWindow, Position } from "./model";
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
  const latest = await r.client.getBlockNumber();
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
    const logs = await r.client.getLogs({
      address: r.game.address,
      fromBlock: start,
      toBlock: start + 4999n < latest ? start + 4999n : latest,
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
