import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import type { GameEvent } from "./data";
import type { Runtime } from "./config";
import {
  createRpcPool,
  decodeVolumeEvent,
  VolumeScanner,
  type ScanProgress,
} from "./leaderboard";
import {
  LEADERBOARD_DEPLOYMENT_BLOCK,
  LEADERBOARD_CACHE_VERSION,
  LEADERBOARD_TEAM,
  LEADERBOARD_EVENTS,
  LEADERBOARD_REFRESH_MS,
  LEADERBOARD_RPCS,
  LEADERBOARD_TICKET_PRICE,
} from "./leaderboard-config";

export function useLeaderboard(r: Runtime, active: boolean) {
  const [retrying, setRetrying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [progress, setProgress] = useState<ScanProgress>();
  const scanner = useMemo(() => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* In-memory mode is supported. */
    }
    return new VolumeScanner({
      chainId: r.chain.id,
      address: r.game.address,
      deploymentBlock: LEADERBOARD_DEPLOYMENT_BLOCK,
      abi: LEADERBOARD_EVENTS,
      historyAbi: r.game.abi,
      decode: (log) =>
        decodeVolumeEvent(LEADERBOARD_EVENTS, log, LEADERBOARD_TICKET_PRICE),
      rpc: createRpcPool(LEADERBOARD_RPCS, {
        onRetry: () => setRetrying(true),
      }),
      storage,
      cacheVersion: LEADERBOARD_CACHE_VERSION,
      excludedAddresses: [LEADERBOARD_TEAM],
    });
  }, [r.chain.id, r.game.address]);
  // One query owns the scanner, raw history and ranking checkpoint. Transactions
  // invalidate this same query, so new bets/claims reach every consumer together.
  const query = useQuery({
    queryKey: ["events", r.chain.id, r.game.address.toLowerCase()],
    queryFn: async ({ signal }) => {
      setRetrying(false);
      const next = await scanner.scan(
        signal,
        (p) => {
          setProgress(p);
          setRetrying(false);
        },
        () => setResetting(true),
      );
      setResetting(false);
      return next;
    },
    initialData: () => scanner.snapshot(),
    // Keep the leaderboard's minute cadence. Other game views previously read
    // events every 20 seconds; they now advance the same checkpoint incrementally.
    refetchInterval: (q) =>
      q.state.status === "error"
        ? 15_000
        : active
          ? LEADERBOARD_REFRESH_MS
          : 20_000,
    refetchOnWindowFocus: "always",
    retry: false, // The RPC pool already rotates and retries each bounded request.
  });
  const snapshot = resetting ? undefined : query.data;
  const history = useMemo<GameEvent[] | undefined>(
    () =>
      snapshot?.history?.map((log) => {
        const decoded = decodeEventLog({
          abi: r.game.abi,
          data: log.data,
          topics: log.topics as any,
          strict: true,
        });
        return {
          eventName: decoded.eventName!,
          args: decoded.args as Record<string, any>,
          transactionHash: log.transactionHash,
          logIndex: Number(BigInt(log.logIndex)),
          blockNumber: BigInt(log.blockNumber),
        };
      }),
    [snapshot?.history, r.game.abi],
  );
  return {
    snapshot,
    events: { data: history, isError: query.isError },
    progress,
    scanning: query.isFetching,
    retrying: retrying || query.isError,
    cacheAvailable: scanner.cacheAvailable,
    retry: () => void query.refetch(),
  };
}
export type LeaderboardData = ReturnType<typeof useLeaderboard>;
