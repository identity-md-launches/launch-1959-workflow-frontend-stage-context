import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { same, loadWindow, useWindow, useToken } from "./data";
import {
  claimValue,
  positionTotal,
  walletWindows,
  exactRank,
} from "./portfolio";
import { units, type Position } from "./model";
import { Action } from "./ui";
import { useTransactions } from "./transactions";
import type { PageProps } from "./Bet";
function positionLabels(p: Position) {
  return [
    ["OVER", p.over[1]],
    ["UNDER", p.over[0]],
    ["SLEEPING", p.sleep[1]],
    ["RUNNING", p.sleep[0]],
    [`EXACT ${p.guess}`, p.exactAmount],
  ]
    .filter(([, v]) => BigInt(v) > 0n)
    .map(([name, v]) => `${name} · ${units(BigInt(v))} IMD`);
}
export function MyBets(props: PageProps) {
  const { r, g } = props,
    { address } = useConnection();
  const current = useWindow(r, g?.currentWindow, address),
    next = useWindow(r, g?.candidate, address);
  const events = useQuery({
    queryKey: ["wallet-windows", address, g?.TEAM],
    enabled: !!address && !!g,
    queryFn: ({ signal }) =>
      walletWindows(r, address!, same(address!, g!.TEAM), signal),
    refetchInterval: 15000,
    retry: 1,
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", address, events.data?.map(String).join(",")],
    enabled: !!address && !!events.data && !!g,
    queryFn: () =>
      Promise.all(
        events.data!.map(async (k) => ({
          k,
          ...(await loadWindow(r, k, address)),
        })),
      ),
    refetchInterval: 12000,
    retry: 1,
  });
  const rows = [
    { label: "Current hour", k: g?.currentWindow, data: current.data },
    { label: "Next hour", k: g?.candidate, data: next.data },
  ].filter((v, i, all) => i === 0 || v.k !== all[0].k);
  const claimable = portfolio.data?.filter(
    (row) =>
      row.position &&
      g &&
      (row.window.status >= 2 ||
        (row.window.status === 1 &&
          BigInt(Math.floor(props.now / 1000)) >= row.times[1])),
  );
  return (
    <section className="my-bets section">
      <div className="section-title">
        <h2>My bets</h2>
        <span className="small muted">Current + next hour</span>
      </div>
      {!address ? (
        <p className="muted">
          Connect your wallet to see your bets and collect your winnings.
        </p>
      ) : (
        <>
          <div className="positions-strip">
            {rows.map((row) => (
              <div className="position-item" key={row.label}>
                <span className="small muted">
                  {row.label} · #{row.k?.toString() ?? "…"}
                </span>
                {!row.data?.position ? (
                  <p>Reading your bets…</p>
                ) : positionTotal(row.data.position) === 0n ? (
                  <p>No bets yet</p>
                ) : (
                  <ul>
                    {positionLabels(row.data.position).map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {(events.isPending || portfolio.isFetching) && (
            <p className="small muted" role="status">
              Looking for your earlier results…
            </p>
          )}
          {(events.isError || portfolio.isError) && (
            <p className="error">
              Your earlier bets could not load.{" "}
              <button
                onClick={() => {
                  void events.refetch();
                  void portfolio.refetch();
                }}
              >
                Retry my bets
              </button>
            </p>
          )}
          {claimable?.map((row) => (
            <ResultCard key={String(row.k)} {...props} k={row.k} />
          ))}
          {!events.isPending &&
            !portfolio.isPending &&
            !events.isError &&
            !portfolio.isError &&
            claimable?.length === 0 && (
              <p className="small muted">
                Your results will appear here when a window closes.
              </p>
            )}
        </>
      )}
      {!address && g && g.currentWindow > 0n && (
        <ResultCard {...props} k={g.currentWindow - 1n} />
      )}
    </section>
  );
}
export function ResultCard({ r, g, ready, now, k }: PageProps & { k: bigint }) {
  const { address } = useConnection(),
    q = useWindow(r, k, address),
    { send } = useTransactions();
  const [includeJackpot, setIncludeJackpot] = useState(true);
  const w = q.data?.window,
    p = q.data?.position;
  const token = useToken(r, w?.jackpot ? w.jackpotAsset : undefined);
  if (!w || !g || w.status === 0) return null;
  const timedOut =
    w.status === 1 &&
    BigInt(Math.floor(now / 1000)) >= q.data!.times[1] + g.TIMEOUT;
  const final = w.status >= 2 || timedOut;
  if (!final)
    return (
      <article className="result-card">
        <img src="./favicon.svg" width="76" height="76" alt="Goggle hamster" />
        <div className="result-body">
          <span className="small muted">Window {k.toString()}</span>
          <h3>Waiting for the result</h3>
          <p>
            The hour has ended. Your payout will appear here when the oracle
            verifies the passes.
          </p>
          <p className="small muted">
            If no result arrives within 48 hours, your bets can be refunded.
          </p>
        </div>
      </article>
    );
  const value =
    p && address
      ? claimValue(w, p, address, g.TEAM, g.oracleReserve, timedOut)
      : undefined;
  const refunded = w.status === 3 || timedOut;
  const canClaim =
    !!value && (value.imd > 0n || (includeJackpot && value.jackpotEligible));
  const won =
    !!p &&
    !refunded &&
    ((!w.marketVoided[0] && p.over[w.result > w.line ? 1 : 0] > 0n) ||
      (!w.marketVoided[2] && p.sleep[w.result === 0n ? 1 : 0] > 0n) ||
      exactRank(w, p) >= 0);
  return (
    <article className="result-card">
      <img
        src={
          w.result === 0n && !refunded
            ? "./assets/hamster-asleep.svg"
            : won
              ? "./assets/hamster-happy.svg"
              : "./favicon.svg"
        }
        width="76"
        height="76"
        alt={
          w.result === 0n && !refunded
            ? "Sleeping hamster"
            : won
              ? "Happy hamster"
              : "Goggle hamster"
        }
      />
      <div className="result-body">
        <span className="small muted">
          Window {k.toString()} ·{" "}
          {refunded ? "Refund available" : "Verified result"}
        </span>
        <h3>{refunded ? "No answer in time" : `${w.result} passes`}</h3>
        <p>
          {refunded
            ? "Everyone gets their bet back."
            : `${w.result === w.line ? "OVER / UNDER refunded" : w.result > w.line ? "OVER won" : "UNDER won"} · ${w.result === 0n ? "SLEEPING won" : "RUNNING won"}`}
        </p>
        {w.status === 2 && (w.marketVoided[0] || w.marketVoided[2]) && (
          <p className="small muted">Uncontested pools are refunded.</p>
        )}
        {value && (
          <p className="payout">
            Your payout: {units(value.imd)} IMD
            {value.jackpotEligible
              ? token.data
                ? ` + ${units(value.jackpot, token.data.decimals)} ${token.data.symbol}`
                : " + jackpot token"
              : ""}
          </p>
        )}
        {address && (
          <>
            <Action
              r={r}
              id={`claim-${k}`}
              label="Claim"
              disabled={
                !ready ||
                !canClaim ||
                q.isError ||
                Date.now() - q.dataUpdatedAt > 45000
              }
              reason={
                !canClaim ? "No unclaimed payout for this wallet." : undefined
              }
              onClick={() =>
                void send(`claim-${k}`, {
                  functionName: "claim",
                  args: [k, includeJackpot],
                })
              }
            />
            {value?.jackpotEligible && (
              <details>
                <summary>Jackpot transfer options</summary>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={includeJackpot}
                    onChange={(e) => setIncludeJackpot(e.target.checked)}
                  />
                  Include jackpot token
                </label>
                <p className="small muted">
                  Turn off to claim IMD separately if the prize token cannot
                  transfer.
                </p>
              </details>
            )}
          </>
        )}
      </div>
    </article>
  );
}
