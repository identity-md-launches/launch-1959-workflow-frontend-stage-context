import { useQuery } from "@tanstack/react-query";
import { services } from "./config";
export interface Stats {
  savedSnapshot?: boolean;
  range: string;
  generatedAt: string;
  lifetime: { observedDistanceMm: string; acceptedWorkUnits: string };
  activity: {
    summary: Record<string, unknown>;
    typicalDay: {
      startMinuteUtc: number;
      meanWorkMilli: string;
      observedDayCount: number;
    }[];
    days: {
      date?: string;
      dayStartAt?: string;
      startAt?: string;
      buckets: {
        startMinuteUtc: number;
        workUnits: string | null;
        coverage: string;
      }[];
    }[];
  };
  records: Record<
    string,
    { value: string; occurredAt: string; coverage: string }
  >;
  rounds: { activeCount: number; observedCount: number; missingCount: number };
}
export function parseStats(d: unknown): Stats {
  if (
    !d ||
    typeof d !== "object" ||
    !Array.isArray((d as Stats).activity?.typicalDay) ||
    !(d as Stats).activity?.summary ||
    !(d as Stats).records ||
    !(d as Stats).rounds ||
    !Number.isFinite(Date.parse((d as Stats).generatedAt))
  )
    throw Error("Telemetry is unavailable. Try again shortly.");
  return d as Stats;
}
export const useStats = (range: 7 | 30) =>
  useQuery({
    queryKey: ["stats", range],
    queryFn: async () => {
      try {
        const r = await fetch(`${services.statsProxy}/stats${range}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw Error("Stats refresh unavailable");
        return parseStats(await r.json());
      } catch {
        const r = await fetch(
          new URL(`telemetry/stats${range}.json`, document.baseURI),
        );
        if (!r.ok) throw Error("Stats are unavailable. Try again shortly.");
        return { ...parseStats(await r.json()), savedSnapshot: true };
      }
    },
    refetchInterval: 60000,
    staleTime: 60000,
    retry: 1,
  });
export function hourly(
  s: Stats | undefined,
  offset = -new Date().getTimezoneOffset(),
) {
  const result = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    value: 0,
    observed: 0,
  }));
  for (const x of s?.activity.typicalDay ?? []) {
    const h = Math.floor(((x.startMinuteUtc + offset + 1440) % 1440) / 60);
    if (x.observedDayCount > 0) {
      result[h].value += Number(x.meanWorkMilli) / 1000;
      result[h].observed++;
    }
  }
  return result;
}
export function wakeEstimate(s: Stats | undefined, now = new Date()) {
  if (!s || now.getTime() - Date.parse(s.generatedAt) > 86400000)
    return undefined;
  const hours = hourly(s, -now.getTimezoneOffset());
  const hour = now.getHours();
  for (let i = 1; i <= 24; i++)
    if (
      hours[(hour + i) % 24].observed > 0 &&
      hours[(hour + i) % 24].value >= 100
    )
      return i;
  return undefined;
}
