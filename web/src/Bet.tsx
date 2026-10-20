import { useEffect, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import type { Runtime } from "./config";
import { reader, useToken, useWindow, type GlobalState } from "./data";
import { amountValue, imd, payout, span, time, type Side } from "./model";
import { useTransaction, TransactionStatus } from "./transactions";
import { CardHead, Icon } from "./ui";
import { useWalletControl } from "./Wallet";
import { blip } from "./sound";
import { Sheet } from "./Sheet";
export interface BetReceipt {
  side: string;
  amount: string;
  line: string;
  time: string;
  hash: string;
}
export function BetPanel({
  r,
  g,
  k,
  setK,
  now,
  onBet,
}: {
  r: Runtime;
  g?: GlobalState;
  k?: bigint;
  setK: (k: bigint) => void;
  now: number;
  onBet: (b: BetReceipt) => void;
}) {
  const { address, chainId } = useConnection(),
    token = useToken(r, address),
    w = useWindow(r, k),
    tx = useTransaction(),
    wallet = useWalletControl();
  const [side, setSide] = useState<Side>("over"),
    [snoozeYes, setYes] = useState(true),
    [amount, setAmount] = useState("5"),
    [error, setError] = useState(""),
    [review, setReview] = useState<{
      k: bigint;
      account: string;
      amount: string;
      side: Side;
      yes: boolean;
      line: string;
      time: string;
    }>();
  const v = w.data?.window;
  let stake = 0n;
  try {
    stake = amountValue(amount, 500000000000000000n);
  } catch {}
  const approved = !!token.data && token.data.allowance >= stake && stake > 0n;
  const preview =
    v && stake > 0n ? payout(v, side, stake, snoozeYes) : undefined;
  const close = v ? Number(v.closesAt) - now : undefined;
  const opens = w.data?.open && close !== undefined && close > 0;
  const label = !address
    ? "Connect to bet"
    : chainId !== 1
      ? "Switch to Ethereum"
      : tx.busy
        ? "Confirming…"
        : !approved
          ? "Approve IMD"
          : `Bet ${amount || "0"} IMD`;
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    if (!address) {
      wallet.open();
      return;
    }
    if (chainId !== 1) {
      await wallet.switchChain();
      return;
    }
    if (k === undefined || !v)
      return setError("The betting hour could not load. Try again.");
    let n: bigint;
    try {
      n = amountValue(amount, 500000000000000000n);
    } catch (e) {
      setError((e as Error).message);
      document.getElementById("bet-amount")?.focus();
      return;
    }
    if (!opens)
      return setError("Betting has closed. Choose the next available hour.");
    if (!token.data)
      return setError(
        "Your IMD balance could not load. Retry the balance check.",
      );
    if (n > token.data.balance)
      return setError("Not enough IMD. Choose a smaller amount or get IMD.");
    if (!approved) {
      await tx.run("approve", [r.game.address, n], true);
      return;
    }
    setReview({
      k,
      account: address,
      amount,
      side,
      yes: snoozeYes,
      line: v.line.toString(),
      time: span(v),
    });
    blip();
  }
  async function place() {
    if (!review) return;
    const draft = review;
    if (address?.toLowerCase() !== draft.account.toLowerCase()) {
      setReview(undefined);
      setError("Your wallet changed. Review the bet again.");
      return;
    }
    const n = amountValue(draft.amount, 500000000000000000n);
    if (!(await reader(r)<boolean>("isBettingOpen", [draft.k]))) {
      setReview(undefined);
      setError("Betting just closed. Choose the next available hour.");
      return;
    }
    const ok = await tx.run(
      draft.side === "snooze" ? "betSnooze" : "betOverUnder",
      [draft.k, draft.side === "snooze" ? draft.yes : draft.side === "over", n],
    );
    if (ok) {
      setReview(undefined);
      onBet({
        side:
          draft.side === "snooze"
            ? `SNOOZE ${draft.yes ? "YES" : "NO"}`
            : draft.side.toUpperCase(),
        amount: draft.amount,
        line: draft.line,
        time: draft.time,
        hash: "",
      });
      blip();
    }
  }
  useEffect(() => setError(""), [k, side]);
  return (
    <section
      className="card bet-panel"
      id="bet-panel"
      aria-labelledby="bet-title"
    >
      <CardHead
        title="Make your pick"
        help="Bets close at the start of the hour. OVER means more than the line, UNDER includes equality. Under 100 passes refunds OVER/UNDER. SNOOZE is a separate yes/no pool. Two-sided pools pay winners after 9% fees; a one-sided pool refunds. Previews change as bets arrive."
      />
      <div className="bet-time">
        {v ? (
          <>
            Bets for <strong>{span(v)}</strong> your time
          </>
        ) : (
          "Reading the next betting hour…"
        )}
        <span className="closing">
          {close === undefined
            ? "Checking close time"
            : close > 0
              ? `closes in ${Math.floor(close / 60)}:${String(close % 60).padStart(2, "0")}`
              : "Betting closed"}
        </span>
      </div>
      <div className="line-display">
        <div>
          <span className="muted">The line to beat</span>
          <strong className="pixel">
            {v?.line.toLocaleString("en-US") ?? "—"}
            <span> passes</span>
          </strong>
        </div>
      </div>
      <div className="sides" aria-label="Choose your bet">
        {(["over", "under", "snooze"] as const).map((s) => (
          <button
            key={s}
            className={`side side-${s} ${side === s ? "selected" : ""}`}
            aria-pressed={side === s}
            onClick={() => {
              setSide(s);
              blip();
            }}
          >
            <span aria-hidden="true">
              {s === "over" ? "↗" : s === "under" ? "↘" : "zZ"}
            </span>
            <strong>{s.toUpperCase()}</strong>
            <small>
              {s === "over"
                ? "More passes"
                : s === "under"
                  ? "At or below"
                  : "Under 100"}
            </small>
          </button>
        ))}
      </div>
      {side === "snooze" && (
        <div className="snooze-choice">
          <span>Will he snooze?</span>
          <button aria-pressed={snoozeYes} onClick={() => setYes(true)}>
            Yes, under 100
          </button>
          <button aria-pressed={!snoozeYes} onClick={() => setYes(false)}>
            No, 100+
          </button>
        </div>
      )}
      <div className="payout-preview" role="status">
        {preview ? (
          preview.refund ? (
            <>
              No opposing bets yet · <strong>full refund if unchanged</strong>
            </>
          ) : (
            <>
              If you win{" "}
              <strong>
                ≈{preview.multiple.toFixed(2)}x · ~{imd(preview.amount)} IMD
              </strong>
            </>
          )
        ) : (
          "Choose an amount to see your estimated return."
        )}
      </div>
      <form id="bet-form" onSubmit={submit}>
        <div className="amount-label">
          <label htmlFor="bet-amount">Your bet</label>
          <span className="muted">
            Balance{" "}
            {address ? `${imd(token.data?.balance)} IMD` : "connect to view"}
          </span>
        </div>
        <div className="amount-control">
          <input
            id="bet-amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="bet-error"
          />
          <span>IMD</span>
          <div className="quick-amounts">
            {["1", "5", "10", "Max"].map((a) => (
              <button
                type="button"
                key={a}
                aria-pressed={a === amount}
                disabled={a === "Max" && !token.data}
                onClick={() =>
                  setAmount(
                    a === "Max"
                      ? formatUnits(token.data?.balance ?? 0n, 18)
                      : a,
                  )
                }
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <button
          className={`primary bet-submit ${side}`}
          type="submit"
          disabled={
            tx.busy || (!!address && chainId === 1 && (!opens || w.isError))
          }
        >
          {label}
          <Icon name="arrow" />
        </button>
        <div className="bet-stepper">
          <span className={approved ? "done" : "current"}>
            {approved ? "✓" : "1"} Approve IMD
          </span>
          <span>→</span>
          <span className={approved ? "current" : ""}>2 Place bet</span>
          <a
            href={`https://app.uniswap.org/swap?chain=mainnet&outputCurrency=${r.token.address}`}
            target="_blank"
            rel="noreferrer"
          >
            Get IMD ↗
          </a>
        </div>
      </form>
      <TransactionStatus r={r} />
      <p className="error" id="bet-error" role="status">
        {error}
      </p>
      {w.isError && (
        <p className="error">
          The betting hour could not load.{" "}
          <button className="text-button" onClick={() => void w.refetch()}>
            Try again
          </button>
        </p>
      )}
      {token.isError && address && (
        <button className="text-button" onClick={() => void token.refetch()}>
          Retry balance check
        </button>
      )}
      <div className="timeline">
        <label htmlFor="bet-hour">Pick another hour</label>
        <select
          id="bet-hour"
          value={k?.toString() ?? ""}
          onChange={(e) => setK(BigInt(e.target.value))}
          disabled={!g}
        >
          {g ? (
            Array.from(
              { length: 24 },
              (_, i) => g.earliestNotStartedWindow + BigInt(i),
            ).map((n, i) => {
              const start = g.GENESIS + n * 3600n;
              return (
                <option value={n.toString()} key={String(n)}>
                  {i === 0 ? "Next · " : ""}
                  {new Date(Number(start) * 1000).toLocaleDateString(
                    undefined,
                    { weekday: "short" },
                  )}{" "}
                  {time(start)}–{time(start + 3600n)}
                </option>
              );
            })
          ) : (
            <option>Loading hours…</option>
          )}
        </select>
      </div>
      <p className="bet-footnote">
        Pools can change. Bet only what you can lose.
      </p>
      {review && (
        <Sheet
          title="Review your bet"
          close={() => setReview(undefined)}
          locked={tx.busy}
        >
          <dl className="review-list">
            <div>
              <dt>Your pick</dt>
              <dd>
                {review.side.toUpperCase()}
                {review.side === "snooze" ? (review.yes ? " YES" : " NO") : ""}
              </dd>
            </div>
            <div>
              <dt>Betting hour</dt>
              <dd>{review.time} your time</dd>
            </div>
            <div>
              <dt>Line</dt>
              <dd>{BigInt(review.line).toLocaleString("en-US")} passes</dd>
            </div>
            <div>
              <dt>You spend</dt>
              <dd>{review.amount} IMD + ETH gas</dd>
            </div>
          </dl>
          <p>
            Submitted bets cannot be cancelled. Your return depends on the final
            pools.
          </p>
          <button
            className="primary"
            onClick={() =>
              void place().catch((e) => setError((e as Error).message))
            }
            disabled={tx.busy}
          >
            {tx.busy ? "Confirming…" : `Place ${review.amount} IMD bet`}
          </button>
          {tx.error && <p className="error">{tx.error}</p>}
        </Sheet>
      )}
    </section>
  );
}
