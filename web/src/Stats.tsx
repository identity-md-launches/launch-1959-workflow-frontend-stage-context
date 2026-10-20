import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "./config";
import type { GameEvent } from "./data";
import { useStats, hourly } from "./telemetry";
import { CardHead, Empty } from "./ui";
import { imd, dateLabel } from "./model";
export function Activity({ compact = false }: { compact?: boolean }) {
  const s = useStats(7),
    values = hourly(s.data),
    max = Math.max(1, ...values.map((x) => x.value)),
    hour = new Date().getHours();
  return (
    <section className={`card activity ${compact ? "compact" : ""}`}>
      <CardHead
        title="A hamster’s usual day"
        help="Mean passes by your local hour, from Squeekchain’s last 7 days of observed telemetry. Gaps are unknown, never zero. The marker is your local time. Past activity is not a promise of future running."
      />
      <div
        className="activity-bars"
        role="img"
        aria-label={`Typical daily activity in your local time. You are here at ${hour}:00. ${s.data ? "Based on 7 days of Squeekchain telemetry." : "Telemetry has not loaded."}`}
      >
        {values.map((x) => (
          <div
            key={x.hour}
            className={`activity-hour ${`${x.hour === hour ? "here" : ""} ${x.observed ? "" : "is-unknown"}`}`}
            title={`${String(x.hour).padStart(2, "0")}:00 · ${x.observed ? Math.round(x.value).toLocaleString() + " mean passes" : "unknown"}`}
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
            ? `${s.data.savedSnapshot ? "Saved " : ""}7-day average · ${new Date(s.data.generatedAt).toLocaleDateString()} · your local time`
            : "Reading Squeekchain telemetry…"}
      </p>
    </section>
  );
}
export function Stats({
  r,
  events,
  eventError,
}: {
  r: Runtime;
  events?: GameEvent[];
  eventError: boolean;
}) {
  const [range, setRange] = useState<7 | 30>(7),
    s = useStats(range);
  const values = hourly(s.data),
    max = Math.max(1, ...values.map((x) => x.value));
  const bets = (events ?? []).filter((e) => e.eventName === "BinaryBet"),
    tickets = (events ?? []).filter((e) => e.eventName === "TicketBought"),
    claimed = (events ?? []).filter((e) => e.eventName === "Claimed"),
    hits = (events ?? []).filter(
      (e) => e.eventName === "JackpotFinalized" && e.args.winners > 0n,
    );
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
      <section className="card">
        <CardHead
          title="A typical day, by hour"
          help="Observed mean passes for each local hour, aggregated from Squeekchain’s half-hour buckets for the selected date range. No observed data means unknown. Partial historical coverage is reported by the upstream service."
        />
        {s.isError ? (
          <Empty>
            <p>Stats could not load.</p>
            <button onClick={() => void s.refetch()}>Try again</button>
          </Empty>
        ) : (
          <>
            <div
              className="typical-chart"
              role="img"
              aria-label={values
                .map(
                  (x) =>
                    `${String(x.hour).padStart(2, "0")}:00: ${x.observed ? `${Math.round(x.value)} mean passes` : "unknown"}`,
                )
                .join("; ")}
            >
              {values.map((x) => (
                <div
                  key={x.hour}
                  title={`${x.hour}:00 · ${x.observed ? Math.round(x.value) + " mean passes" : "unknown"}`}
                >
                  <i
                    style={{ height: `${Math.max(2, (x.value / max) * 100)}%` }}
                  />
                  <span>{String(x.hour).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
            <p className="small muted">
              {s.data
                ? `${s.data.savedSnapshot ? "Saved telemetry · refresh unavailable · " : ""}Observed ${range}-day averages · your time · updated ${dateLabel(Date.parse(s.data.generatedAt) / 1000)}`
                : "Loading observed telemetry…"}
            </p>
          </>
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
                    ).toLocaleString(undefined, { maximumFractionDigits: 2 })
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
                    ).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Observed active intervals</dt>
              <dd>
                {s.data
                  ? `${s.data.rounds.activeCount} / ${s.data.rounds.observedCount}`
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
                        ).toLocaleString(undefined, {
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
                  ? String(fb.length + ft.length)
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
                  ? String(
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
