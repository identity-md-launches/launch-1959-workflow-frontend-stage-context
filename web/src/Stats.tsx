import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "./config";
import { useResults, type GameEvent, type GlobalState } from "./data";
import { useRounds } from "./live";
import { completedWindows, observedPasses, winningSides } from "./history";
import { useStats, hourly } from "./telemetry";
import { CardHead } from "./ui";
import { imd, dateLabel, span, number } from "./model";
export function Activity({ range = 7 }: { range?: 7 | 30 }) {
  const s = useStats(range),
    values = hourly(s.data),
    max = Math.max(1, ...values.map((x) => x.value)),
    hour = new Date().getHours();
  return (
    <section className="card activity">
      <CardHead
        title="A hamster’s usual day"
        help={`Mean passes by your local hour, from Squeekchain’s last ${range} days of observed telemetry. Gaps are unknown, never zero. The marker is your local time. Past activity is not a promise of future running.`}
      />
      <div
        className="activity-bars"
        role="img"
        aria-label={`Typical daily activity in your local time. You are here at ${hour}:00. ${s.data ? `Based on ${range} days of Squeekchain telemetry. ${values.map((x) => `${x.hour}:00: ${x.observed ? number(Math.round(x.value)) + " mean passes" : "unknown"}`).join("; ")}` : "Telemetry has not loaded."}`}
      >
        {values.map((x) => (
          <div
            key={x.hour}
            className={`activity-hour ${`${x.hour === hour ? "here" : ""} ${x.observed ? "" : "is-unknown"}`}`}
            title={`${String(x.hour).padStart(2, "0")}:00 · ${x.observed ? number(Math.round(x.value)) + " mean passes" : "unknown"}`}
            style={
              {
                "--height": `${Math.max(5, (x.value / max) * 100)}%`,
                "--strength": x.observed ? Math.max(0.18, x.value / max) : 0.05,
              } as CSSProperties
            }
          >
            <i />
            {x.hour === hour && <span>You are here</span>}
          </div>
        ))}
      </div>
      <div className="chart-axis">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
      <p className="small muted">
        {s.isError
          ? "Activity couldn’t load. The service will retry."
          : s.data
            ? `${s.data.savedSnapshot ? "Saved telemetry · refresh unavailable · " : ""}Observed ${range}-day averages · updated ${dateLabel(Date.parse(s.data.generatedAt) / 1000)} · your local time`
            : "Reading Squeekchain telemetry…"}
      </p>
    </section>
  );
}
export function Stats({
  r,
  g,
  now,
  events,
  eventError,
}: {
  r: Runtime;
  g?: GlobalState;
  now: number;
  events?: GameEvent[];
  eventError: boolean;
}) {
  const [range, setRange] = useState<7 | 30>(7),
    s = useStats(range);
  const results = useResults(r, g),
    rounds = useRounds();
  const windows = completedWindows(results.data ?? [], BigInt(now));
  const sum = (es: GameEvent[]) => es.reduce((n, e) => n + e.args.amount, 0n);
  const cutoff = useQuery({
    queryKey: ["stats-event-cutoff", range, events?.length],
    enabled: !!events,
    queryFn: async () => {
      const latest = await r.client.getBlock();
      const target = latest.timestamp - BigInt(range * 86400);
      let lo = BigInt(r.game.deploymentBlock),
        hi = latest.number;
      const deployment = await r.client.getBlock({ blockNumber: lo });
      if (deployment.timestamp >= target) return lo;
      while (lo < hi) {
        const mid = (lo + hi) / 2n;
        const b = await r.client.getBlock({ blockNumber: mid });
        if (b.timestamp < target) lo = mid + 1n;
        else hi = mid;
      }
      return lo;
    },
    staleTime: 60000,
  });
  const filtered = events?.filter((e) => e.blockNumber >= (cutoff.data ?? 0n));
  const fb = filtered?.filter((e) => e.eventName === "BinaryBet") ?? [],
    ft = filtered?.filter((e) => e.eventName === "TicketBought") ?? [];
  return (
    <div className="stats-page">
      <div className="section-intro">
        <div>
          <h1>Small paws. Big numbers.</h1>
          <p>What the wheel’s been up to, in your local time.</p>
        </div>
        <div className="range-tabs" aria-label="Statistics range">
          {([7, 30] as const).map((n) => (
            <button
              key={n}
              aria-pressed={range === n}
              onClick={() => setRange(n)}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      <Activity range={range} />
      <section className="card results">
        <CardHead
          title="The last 24 hours"
          help="Finished windows, newest first. Passes are actual complete observations from worker rounds or dated stats; gaps stay unknown. The frozen line and winning sides come from the game. Only the oracle determines payouts."
        />
        <p className="small muted history-note">
          Your local time. Passes are observed telemetry; winning sides are
          oracle results.
        </p>
        <div
          className="result-ribbon"
          tabIndex={0}
          role="region"
          aria-label="Results from the last 24 hours; scroll horizontally for more"
        >
          {windows.map((w) => {
            const observed = observedPasses(
              w,
              s.data,
              rounds.isError ? undefined : rounds.data,
            );
            const passes = observed ?? (w.status === 2 ? w.result : undefined);
            const outcome = winningSides(w);
            return (
              <div
                key={String(w.index)}
                className={`result-item ${w.status === 2 ? (w.result < 100n ? "snooze" : w.result > w.line ? "over" : "under") : "pending"}`}
                data-ended-at={String(w.endsAt)}
              >
                <span>
                  {new Date(Number(w.startsAt) * 1000).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" },
                  )}
                </span>
                <span>{span(w)}</span>
                <strong className="pixel">
                  {passes !== undefined ? number(passes) : "—"}
                </strong>
                <span>
                  {passes !== undefined
                    ? observed !== undefined
                      ? "observed passes"
                      : "oracle passes"
                    : "No observation"}
                </span>
                <span className="result-line">line {number(w.line)}</span>
                <small>{outcome}</small>
                {w.status === 2 &&
                  observed !== undefined &&
                  observed !== w.result && (
                    <small>Oracle: {number(w.result)}</small>
                  )}
              </div>
            );
          })}
          {!results.data && (
            <p className="muted">
              {results.isError
                ? "Results could not load."
                : "Reading completed hours…"}
              {results.isError && (
                <button
                  className="text-button"
                  onClick={() => void results.refetch()}
                >
                  Try again
                </button>
              )}
            </p>
          )}
          {results.data && !windows.length && (
            <p className="muted">No completed windows in the last 24 hours.</p>
          )}
        </div>
        {windows.some(
          (w) =>
            w.status !== 2 &&
            observedPasses(
              w,
              s.data,
              rounds.isError ? undefined : rounds.data,
            ) === undefined,
        ) && (
          <p className="small muted">
            Some hours have no complete telemetry yet. Missing passes stay
            unknown.
          </p>
        )}
      </section>
      <div className="stats-grid">
        <section className="card">
          <CardHead
            title="From the wheel"
            help="Distance and passes cover the selected telemetry range, using observedDistanceMm from Squeekchain. Missing observations are not extrapolated."
          />
          <dl className="big-stats">
            <div>
              <dt>Distance run</dt>
              <dd className="pixel">
                {s.data
                  ? (
                      Number(s.data.activity.summary.observedDistanceMm ?? 0) /
                      1e6
                    ).toLocaleString("en-US", { maximumFractionDigits: 2 })
                  : "—"}
                <small> km</small>
              </dd>
            </div>
            <div>
              <dt>Wheel passes</dt>
              <dd className="pixel">
                {s.data
                  ? Number(
                      s.data.activity.summary.observedWorkUnits,
                    ).toLocaleString("en-US")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Observed active intervals</dt>
              <dd>
                {s.data
                  ? `${number(s.data.rounds.activeCount)} / ${number(s.data.rounds.observedCount)}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="card">
          <CardHead
            title="Little world records"
            help="Squeekchain’s recorded best values in the returned telemetry dataset. Dates and coverage come from the source; these are measurements, not betting results."
          />
          <dl className="record-list">
            {[
              ["mostWorkHalfHour", "Passes in 30 minutes", "passes"],
              ["maximumDailyDistanceMm", "Longest day", "km"],
              ["peakObservedSpeedMmPerSecond", "Top speed", "m/s"],
              ["longestActiveWindowMinutes", "Longest run", "min"],
            ].map(([key, label, unit]) => {
              const record = s.data?.records[key];
              return (
                <div key={key}>
                  <dt>
                    {label}
                    <small>
                      {record
                        ? `${dateLabel(Date.parse(record.occurredAt) / 1000)} · ${record.coverage}`
                        : ""}
                    </small>
                  </dt>
                  <dd>
                    {record
                      ? (
                          Number(record.value) /
                          (unit === "km" ? 1e6 : unit === "m/s" ? 1000 : 1)
                        ).toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })
                      : "—"}{" "}
                    {unit}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      </div>
      <section className="card">
        <CardHead
          title="The game, on-chain"
          help="Event totals from this v2 deployment, limited to the selected 7 or 30 days by Ethereum block timestamps. Volume includes binary bets and 5 IMD tickets. The contract has no off-chain user database."
        />
        {eventError || cutoff.isError ? (
          <p className="error">Event statistics could not load.</p>
        ) : (
          <div className="game-stats">
            {[
              [
                "Bet volume",
                filtered && cutoff.data !== undefined
                  ? `${imd(sum(fb) + BigInt(ft.length) * 5000000000000000000n)} IMD`
                  : "—",
              ],
              [
                "Bets placed",
                filtered && cutoff.data !== undefined
                  ? number(fb.length + ft.length)
                  : "—",
              ],
              [
                "IMD claimed",
                filtered && cutoff.data !== undefined
                  ? imd(sum(filtered.filter((e) => e.eventName === "Claimed")))
                  : "—",
              ],
              [
                "Jackpot hits",
                filtered && cutoff.data !== undefined
                  ? number(
                      filtered.filter(
                        (e) =>
                          e.eventName === "JackpotFinalized" &&
                          e.args.winners > 0n,
                      ).length,
                    )
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className="pixel">{value}</strong>
              </div>
            ))}
          </div>
        )}
        <a
          href={`${r.deployment.network.explorer}/address/${r.game.address}#events`}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          See the receipts on Etherscan ↗
        </a>
      </section>
    </div>
  );
}
