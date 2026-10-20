import type { GameWindow } from "./model";
import { SQUEEKCHAIN_GENESIS, type Settlement } from "./live";
import type { Stats } from "./telemetry";

/** Completed hours only; a fabricated future record cannot become a past result. */
export function completedWindows(windows: readonly GameWindow[], now: bigint) {
  return windows
    .filter(
      (w) =>
        w.startsAt < w.endsAt && w.endsAt <= now && w.endsAt > now - 86400n,
    )
    .slice()
    .sort((a, b) => (a.endsAt > b.endsAt ? -1 : a.endsAt < b.endsAt ? 1 : 0));
}

/** Complete half-hour observations, never a typical-day mean or a partial sum. */
export function observedPasses(
  w: GameWindow,
  stats?: Stats,
  rounds?: readonly Settlement[],
) {
  const boundary = (at: bigint) => {
    if ((at - SQUEEKCHAIN_GENESIS) % 600n !== 0n) return undefined;
    const n = (at - SQUEEKCHAIN_GENESIS) / 600n;
    for (const row of rounds ?? []) {
      if (row.settledThroughRound === n) return row.cumulativeWork;
      if (row.previousSettledThroughRound === n)
        return row.cumulativeWork - row.workAdded;
      if (
        row.workAdded === 0n &&
        row.previousSettledThroughRound <= n &&
        n <= row.settledThroughRound
      )
        return row.cumulativeWork;
    }
    return undefined;
  };
  const before = boundary(w.startsAt),
    after = boundary(w.endsAt);
  if (before !== undefined && after !== undefined && after >= before)
    return after - before;
  const start = Number(w.startsAt) * 1000,
    end = Number(w.endsAt) * 1000;
  let total = 0n,
    cursor = start;
  const buckets = (stats?.activity.days ?? [])
    .flatMap((day) => {
      const date =
        day.dayStartAt ??
        day.startAt ??
        (day.date ? `${day.date}T00:00:00Z` : "");
      const midnight = Date.parse(date);
      return day.buckets.map((b) => ({
        ...b,
        at: midnight + b.startMinuteUtc * 60000,
      }));
    })
    .filter((b) => b.at + 1800000 > start && b.at < end)
    .sort((a, b) => a.at - b.at);
  for (const b of buckets) {
    if (
      Math.max(start, b.at) !== cursor ||
      b.coverage !== "complete" ||
      b.workUnits === null ||
      !/^\d+$/.test(b.workUnits)
    )
      return undefined;
    const clipped = b.at < start || b.at + 1800000 > end;
    // Zero over a fully observed bucket is zero over every subinterval. A
    // positive half-hour total cannot be apportioned across a :20 boundary.
    if (clipped && BigInt(b.workUnits) !== 0n) return undefined;
    total += BigInt(b.workUnits);
    cursor = Math.min(end, b.at + 1800000);
  }
  return cursor === end ? total : undefined;
}

/** Market outcomes remain oracle results, independent of informational telemetry. */
export function winningSides(w: GameWindow) {
  if (w.over + w.under + w.yes + w.no + w.tickets === 0n) return "No bets";
  if (w.status === 3) return "Refund";
  if (w.status !== 2) return "Awaiting oracle";
  const sides: string[] = [];
  if (w.over + w.under > 0n)
    sides.push(
      w.ouVoid || w.result < 100n || w.over === 0n || w.under === 0n
        ? "Over/under refunded"
        : w.result > w.line
          ? "Over"
          : "Under",
    );
  if (w.yes + w.no > 0n)
    sides.push(
      w.snVoid || w.yes === 0n || w.no === 0n
        ? "Snooze refunded"
        : w.result < 100n
          ? "Snooze yes"
          : "Snooze no",
    );
  if (w.tickets > 0n)
    sides.push(
      !w.jackpotFinalized
        ? "Jackpot pending"
        : w.jackpotWinners > 0n
          ? "Jackpot hit"
          : "Jackpot carried",
    );
  return sides.join(" · ");
}
