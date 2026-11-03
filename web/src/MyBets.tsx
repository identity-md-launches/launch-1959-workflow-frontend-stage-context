import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import type { Runtime } from "./config";
import { reader, useMyBets, type SharedEvents } from "./data";
import { imd, span, type GameWindow } from "./model";

const dayLabel = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
import {
  classify,
  countdown,
  marketName,
  utcLabel,
  STATUS,
  WAITING_TOOLTIP,
  type WindowRow,
} from "./mybets";
import { useTransaction, TransactionStatus } from "./transactions";
import { useWalletControl } from "./Wallet";
import { CardHead, Empty, Help } from "./ui";
import { Confetti } from "./pixel";
import { blip } from "./sound";

const payable = (x: WindowRow) =>
  x.due > 0n && (x.claimable > 0n || x.needsTimeout);

export function MyBets({
  r,
  now,
  events,
}: {
  r: Runtime;
  now: number;
  events: SharedEvents;
}) {
  const { address } = useConnection(),
    wallet = useWalletControl(),
    tx = useTransaction(),
    bets = useMyBets(r, address, events);
  const [note, setNote] = useState(""),
    [flash, setFlash] = useState(false);
  const celebrated = useRef("");
  const clock = BigInt(now);
  const rows = bets.data
    ? classify(bets.data.bets, bets.data.reads, clock)
    : undefined;
  const ready = rows?.filter(payable) ?? [];
  const total = ready.reduce((n, x) => n + x.due, 0n);
  const staked = rows?.reduce((n, x) => n + x.staked, 0n) ?? 0n;
  const count = rows?.reduce((n, x) => n + x.bets.length, 0) ?? 0;
  const balance = bets.data?.balance ?? 0n;
  const winKey = (rows ?? [])
    .filter((x) => x.bets.some((b) => b.state === "won"))
    .map((x) => String(x.k))
    .join(",");
  useEffect(() => {
    if (winKey && celebrated.current !== winKey) {
      celebrated.current = winKey;
      setFlash(true);
      blip(true);
      const timer = setTimeout(() => setFlash(false), 2600);
      return () => clearTimeout(timer);
    }
  }, [winKey]);

  /** Times the hour out first when its 48h deadline passed unmarked, then claims. */
  async function claimHour(k: bigint, position: number, of: number) {
    const read = reader(r);
    const w = await read<GameWindow>("windowInfo", [k]);
    const step = of > 1 ? `Hour ${position} of ${of}: ` : "";
    if (w.status === STATUS.Open) {
      setNote(`${step}confirm the timeout that unlocks your refund.`);
      if (!(await tx.run("timeout", [k]))) return false;
    }
    const amount = await read<bigint>("claimable", [k, address]);
    if (amount === 0n) return true;
    setNote(`${step}confirm the claim of ${imd(amount)} IMD in your wallet.`);
    return tx.run("claim", [k]);
  }
  async function claimOne(x: WindowRow) {
    setNote("");
    if (await claimHour(x.k, 1, 1))
      setNote(`Hour claimed. The IMD is in your wallet.`);
    await bets.refetch();
  }
  async function claimAll() {
    setNote("");
    const list = ready.slice().sort((a, b) => (a.k < b.k ? -1 : 1));
    let done = 0;
    for (const x of list) {
      if (!(await claimHour(x.k, done + 1, list.length))) {
        setNote(
          `${done} ${done === 1 ? "hour" : "hours"} claimed. The rest are still claimable.`,
        );
        await bets.refetch();
        return;
      }
      done++;
    }
    setNote(`${done} ${done === 1 ? "hour" : "hours"} claimed.`);
    await bets.refetch();
  }
  const failed = (text: string) => () => setNote(text);

  return (
    <section className="card my-bets" id="my-bets">
      <CardHead
        title="My bets"
        help="Every bet of the connected wallet, read from the game's BinaryBet and TicketBought events on Ethereum. Claims pay IMD straight to your wallet. One-sided markets and hours nobody settled within 48 hours are refunded in full, with no fees. Claims never expire."
      />
      {!address ? (
        <Empty>
          <span className="empty-seeds" aria-hidden="true">
            ○ ○ ○
          </span>
          <h3>Your little stake in the wheel.</h3>
          <p>Connect your wallet to see your bets and claim your IMD.</p>
          <button onClick={wallet.open}>Connect wallet ↗</button>
        </Empty>
      ) : bets.waitingForEvents ? (
        <Empty>
          <p role="status">Finding your bets…</p>
        </Empty>
      ) : bets.isError ? (
        <Empty>
          <p role="alert">
            Your bets could not load. No balances have been changed.
          </p>
          <button onClick={() => void bets.refetch()}>Try again</button>
        </Empty>
      ) : !rows ? (
        <Empty>
          <p role="status">Finding your bets…</p>
        </Empty>
      ) : !rows.length ? (
        <Empty>
          <h3>A fresh start.</h3>
          <p>Your confirmed bets will appear here.</p>
          <a className="button" href="#play">
            Make your first pick ↗
          </a>
        </Empty>
      ) : (
        <>
          {balance > 0n && (
            <div className="withdraw-banner">
              <span>
                {imd(balance)} IMD is held for you in the game contract.
              </span>
              <button
                className="primary"
                disabled={tx.busy}
                onClick={() =>
                  void tx
                    .run("withdraw", [])
                    .then(() => bets.refetch())
                    .catch(
                      failed("The withdraw failed. Refresh and try again."),
                    )
                }
              >
                Withdraw {imd(balance)} IMD
              </button>
            </div>
          )}
          {winKey && (
            <div className="win-banner">
              A little wheel, a lovely win. {flash && <Confetti />}
            </div>
          )}
          <div className="claims-summary">
            <div>
              <span className="muted">Ready to claim</span>
              <strong className="pixel">{imd(total)} IMD</strong>
            </div>
            <button
              className="primary"
              disabled={total === 0n || tx.busy}
              onClick={() =>
                void claimAll().catch(
                  failed("The claim check failed. Refresh and try again."),
                )
              }
            >
              Claim all
            </button>
          </div>
          <p className="small muted">
            {count} {count === 1 ? "bet" : "bets"} · {imd(staked)} IMD staked
            {ready.length > 0 &&
              ` · ${ready.length} ${ready.length === 1 ? "hour" : "hours"} to claim, one wallet confirmation each`}
          </p>
          <ol className="bet-hours" aria-label="Your bets by hour">
            {rows.map((x) => (
              <li key={String(x.k)} className="bet-hour">
                <div className="bet-hour-head">
                  <strong>{span(x.window)} your time</strong>
                  <span className="muted">
                    {dayLabel(x.window.startsAt)} · hour {x.k.toString()}
                  </span>
                </div>
                <ul className="bet-lines">
                  {x.bets.map((b) => (
                    <li
                      key={`${b.transactionHash}:${b.logIndex}`}
                      className="bet-line"
                    >
                      <div className="bet-what">
                        <strong>
                          {marketName(b)}
                          {b.kind === "ticket"
                            ? ` · guess ${b.guess?.toString()}`
                            : ""}{" "}
                          · {imd(b.amount)} IMD
                        </strong>
                        {b.state === "waiting-refund" && b.unlockAt ? (
                          <span>
                            Refund unlocks in{" "}
                            <strong>{countdown(b.unlockAt - clock)}</strong> ·{" "}
                            {utcLabel(b.unlockAt)}
                          </span>
                        ) : (
                          b.note && <span>{b.note}</span>
                        )}
                        <a
                          className="tx-link"
                          href={`${r.deployment.network.explorer}/tx/${b.transactionHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Bet transaction ↗
                        </a>
                      </div>
                      <div className="bet-state-cell">
                        <span
                          className={`bet-state state-${b.state}`}
                          title={
                            b.state === "waiting-refund"
                              ? WAITING_TOOLTIP
                              : undefined
                          }
                        >
                          {b.label}
                        </span>
                        {b.value !== undefined &&
                          b.state !== "waiting-refund" &&
                          b.state !== "lost" && (
                            <small>
                              {b.state === "won" || b.state === "claimed"
                                ? "Payout "
                                : ""}
                              {imd(b.value)} IMD
                            </small>
                          )}
                        {b.state === "waiting-refund" && (
                          <Help label="Waiting for refund">
                            {WAITING_TOOLTIP}
                          </Help>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {(payable(x) || x.loss > 0n || x.claimed) && (
                  <div className="bet-hour-foot">
                    {x.loss > 0n && (
                      <small>{imd(x.loss)} IMD eligible loss</small>
                    )}
                    {payable(x) ? (
                      <button
                        className="primary"
                        disabled={tx.busy}
                        onClick={() =>
                          void claimOne(x).catch(
                            failed(
                              "The claim check failed. Refresh and try again.",
                            ),
                          )
                        }
                      >
                        Claim {imd(x.due)} IMD
                      </button>
                    ) : (
                      x.claimed && <small>Claimed to your wallet</small>
                    )}
                  </div>
                )}
                {x.needsTimeout && payable(x) && (
                  <p className="small muted bet-hour-hint">
                    The 48h deadline passed. Claim sends two confirmations: one
                    to time the hour out, one to claim.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      <TransactionStatus r={r} />
      <p role="status" className="small">
        {note}
      </p>
    </section>
  );
}
