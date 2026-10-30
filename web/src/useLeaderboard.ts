import { useEffect, useMemo, useState } from "react";
import type { Runtime } from "./config";
import {
  createRpcPool,
  decodeVolumeEvent,
  VolumeScanner,
  type ScanProgress,
  type VolumeSnapshot,
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
  const [snapshot, setSnapshot] = useState<VolumeSnapshot | undefined>(() =>
    scanner.snapshot(),
  );
  const [progress, setProgress] = useState<ScanProgress>();
  const [scanning, setScanning] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (!active) return;
    let disposed = false,
      busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const run = async () => {
      if (disposed || busy || document.hidden) return;
      clearTimeout(timer);
      busy = true;
      controller = new AbortController();
      setScanning(true);
      setRetrying(false);
      let failed = false;
      try {
        const next = await scanner.scan(
          controller.signal,
          (p) => {
            if (!disposed) {
              setProgress(p);
              setRetrying(false);
            }
          },
          () => {
            if (!disposed) setSnapshot(undefined);
          },
        );
        if (!disposed) {
          setSnapshot(next);
          setRetrying(false);
        }
      } catch {
        failed = true;
        if (!disposed) setRetrying(true);
      } finally {
        busy = false;
        if (!disposed) {
          setScanning(false);
          // Background recovery is faster than the usual one-minute refresh.
          timer = setTimeout(
            () => void run(),
            failed ? 15_000 : LEADERBOARD_REFRESH_MS,
          );
        }
      }
    };
    const visible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", visible);
    void run();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [active, scanner, request]);
  return {
    snapshot,
    progress,
    scanning,
    retrying,
    cacheAvailable: scanner.cacheAvailable,
    retry: () => setRequest((n) => n + 1),
  };
}
export type LeaderboardData = ReturnType<typeof useLeaderboard>;
