import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { services } from "./config";
/** The channel's last known stream, used only when the proxy cannot answer. */
export const FALLBACK_STREAM = "6K_uF2s-LSw";
const lastLiveKey = "hamster-hour:last-live-id";
export type Live = {
  state: string;
  kind?: string;
  publicId?: string;
};
export type Status = {
  speedMmPerSecond: number;
  cumulativeWorkUnits: string;
  liveCounter?: bigint;
  observedAt?: string;
  freshness?: string;
};
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{11}$/.test(v);
export function parseLive(data: unknown): Live {
  if (!data || typeof data !== "object") throw Error("The live feed is empty.");
  const d = data as Record<string, any>;
  const playback =
    d.playback && typeof d.playback === "object" ? d.playback : {};
  const publicId = validId(playback.publicId)
    ? playback.publicId
    : validId(d.publicId)
      ? d.publicId
      : undefined;
  return {
    state: typeof d.state === "string" ? d.state : "unknown",
    kind: typeof playback.kind === "string" ? playback.kind : undefined,
    publicId,
  };
}
export function parseStatus(data: unknown): Status {
  if (!data || typeof data !== "object")
    throw Error("The status feed is empty.");
  const m = (data as Record<string, any>).measurement ?? {};
  const speed = Number(m.speedMmPerSecond);
  const units = m.cumulativeWorkUnits;
  return {
    speedMmPerSecond: Number.isFinite(speed) && speed >= 0 ? speed : 0,
    cumulativeWorkUnits:
      typeof units === "string" && /^\d+$/.test(units)
        ? units
        : typeof units === "number" && Number.isFinite(units)
          ? String(Math.floor(units))
          : "0",
    liveCounter:
      typeof units === "string" && /^\d+$/.test(units)
        ? BigInt(units)
        : undefined,
    observedAt: typeof m.observedAt === "string" ? m.observedAt : undefined,
    freshness: typeof m.freshness === "string" ? m.freshness : undefined,
  };
}
async function getJSON(path: string) {
  const r = await fetch(`${services.proxy}${path}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw Error(`The proxy returned ${r.status}.`);
  return r.json();
}
export function rememberLiveId(id: string) {
  try {
    localStorage.setItem(lastLiveKey, id);
  } catch {
    /* memory is optional */
  }
}
export function lastKnownStream() {
  try {
    const id = localStorage.getItem(lastLiveKey);
    if (validId(id)) return id;
  } catch {
    /* fall through */
  }
  return FALLBACK_STREAM;
}
/** GET /live every 20 s through the project's proxy. */
export function useLive() {
  return useQuery({
    queryKey: ["live"],
    queryFn: async () => {
      const live = parseLive(await getJSON("/live"));
      if (live.state === "live" && live.kind === "youtube" && live.publicId)
        rememberLiveId(live.publicId);
      return live;
    },
    refetchInterval: 20000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
/** GET /status every 20 s through the project's proxy. */
export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: async () => parseStatus(await getJSON("/status")),
    refetchInterval: 20000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
export type Settlement = {
  previousSettledThroughRound: bigint;
  settledThroughRound: bigint;
  cumulativeWork: bigint;
  workAdded: bigint;
};
/** Only decimal strings are accepted: JSON numbers can lose counter precision. */
export function parseRounds(data: unknown): Settlement[] {
  const list = (data as { recentSettlements?: unknown } | null)
    ?.recentSettlements;
  if (!Array.isArray(list)) throw Error("The rounds feed is unavailable.");
  const fields = [
    "previousSettledThroughRound",
    "settledThroughRound",
    "cumulativeWork",
    "workAdded",
  ] as const;
  return list.slice(0, 10).flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !fields.every(
        (key) => typeof entry[key] === "string" && /^\d+$/.test(entry[key]),
      )
    )
      return [];
    return [
      {
        previousSettledThroughRound: BigInt(entry.previousSettledThroughRound),
        settledThroughRound: BigInt(entry.settledThroughRound),
        cumulativeWork: BigInt(entry.cumulativeWork),
        workAdded: BigInt(entry.workAdded),
      },
    ];
  });
}
/** GET /rounds uses the same worker as /live and /status, never Squeekchain. */
export function useRounds() {
  return useQuery({
    queryKey: ["rounds"],
    queryFn: async () => parseRounds(await getJSON("/rounds")),
    refetchInterval: 20000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
// This is Squeekchain's epoch, independent of the game's configurable genesis.
export const SQUEEKCHAIN_GENESIS = 1791847800n;
const floorDivide = (n: bigint, d: bigint) =>
  n / d - (n < 0n && n % d !== 0n ? 1n : 0n);
export function windowProgress(
  startsAt: bigint,
  endsAt: bigint,
  now: bigint,
  line: bigint,
  status: Status | undefined,
  settlements: readonly Settlement[] | undefined,
) {
  if (now < startsAt || now >= endsAt) return undefined;
  const firstRound = floorDivide(startsAt - SQUEEKCHAIN_GENESIS, 600n) + 1n;
  const lastRound = firstRound + 5n;
  const round = Number((now - startsAt) / 600n + 1n);
  const r = Math.max(1, Math.min(6, round));
  const exact = settlements?.find(
    (s) => s.settledThroughRound === firstRound - 1n,
  );
  // Select by round even if an upstream list arrives out of order.
  const baseline =
    exact ??
    settlements?.reduce<Settlement | undefined>(
      (best, s) =>
        s.settledThroughRound < firstRound &&
        (!best || s.settledThroughRound > best.settledThroughRound)
          ? s
          : best,
      undefined,
    );
  const total = status?.liveCounter;
  const passes =
    baseline && total !== undefined
      ? total > baseline.cumulativeWork
        ? total - baseline.cumulativeWork
        : 0n
      : undefined;
  const percent =
    passes === undefined
      ? undefined
      : line <= 0n
        ? passes > 0n
          ? 100
          : 0
        : passes >= line
          ? 100
          : Number((passes * 10000n) / line) / 100;
  return {
    firstRound,
    lastRound,
    round: r,
    passes,
    approximate: !!baseline && !exact,
    percent,
  };
}
/** One wheel pass is about 21 cm, so a line of N passes per hour is N·210/3600 mm/s. */
export const PASS_MM = 210;
export const linePace = (line: bigint | undefined) =>
  line === undefined ? undefined : (Number(line) * PASS_MM) / 3600;
export type Mood =
  "sleeping" | "stretching" | "cruising" | "zoomies" | "villain era";
export function mood(
  status: Status | undefined,
  line: bigint | undefined,
  windowPasses?: bigint,
): Mood | undefined {
  if (!status) return undefined;
  const speed = status.speedMmPerSecond;
  if (speed <= 0) return "sleeping";
  const pace = linePace(line);
  if (pace === undefined || pace <= 0) return "cruising";
  if (
    windowPasses !== undefined &&
    line !== undefined &&
    windowPasses > 2n * line
  )
    return "villain era";
  if (speed > pace) return "zoomies";
  if (speed < pace * 0.3) return "stretching";
  return "cruising";
}
const passesKey = (k: bigint) => `hamster-hour:window-start:${k}`;
/**
 * Passes counted in the current window, from the first status sample seen in it.
 * Only this visitor's observations are used; the counter itself comes from /status.
 */
export function useWindowPasses(
  status: Status | undefined,
  currentWindow: bigint | undefined,
) {
  const [value, setValue] = useState<bigint>();
  useEffect(() => {
    if (!status || currentWindow === undefined) return;
    const total = BigInt(status.cumulativeWorkUnits);
    try {
      const key = passesKey(currentWindow);
      let start = localStorage.getItem(key);
      if (!start || !/^\d+$/.test(start)) {
        start = total.toString();
        localStorage.setItem(key, start);
        localStorage.removeItem(passesKey(currentWindow - 1n));
      }
      const s = BigInt(start);
      setValue(total >= s ? total - s : undefined);
    } catch {
      setValue(undefined);
    }
  }, [status, currentWindow]);
  return value;
}
/** True for 3 s after the stream turns from not live to live during this visit. */
export function useWentLive(isLive: boolean | undefined) {
  const previous = useRef<boolean | undefined>(undefined);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (isLive === undefined) return;
    const was = previous.current;
    previous.current = isLive;
    if (was === false && isLive) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 3000);
      return () => clearTimeout(id);
    }
  }, [isLive]);
  return flash;
}
