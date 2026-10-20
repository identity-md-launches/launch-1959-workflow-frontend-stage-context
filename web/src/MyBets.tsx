import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Runtime } from "./config";
import { usePositions, reader, type GameEvent } from "./data";
import { imd, span, type Position } from "./model";
import { useTransaction, TransactionStatus } from "./transactions";
import { useWalletControl } from "./Wallet";
import { CardHead, Empty } from "./ui";
import { Confetti } from "./pixel";
import { blip } from "./sound";
const principal = (p: Position) =>
  p.over + p.under + p.yes + p.no + (p.hasTicket ? 5000000000000000000n : 0n);
export function MyBets({
  r,
  events,
  eventError,
}: {
  r: Runtime;
  events?: GameEvent[];
  eventError: boolean;
}) {
  const cache = useQueryClient();
  const { address } = useConnection(),
    wallet = useWalletControl(),
    tx = useTransaction(),
    bets = usePositions(r, address, events);
  const [note, setNote] = useState(""),
    [flash, setFlash] = useState(false);
  const celebrated = useRef("");
  const rows = bets.data?.slice().sort((a, b) => (a.k > b.k ? -1 : 1));
  const total = rows?.reduce((n, x) => n + x.claimable, 0n) ?? 0n;
  const wins = rows?.filter(
    (x) =>
      x.claimable +
        x.position.paid +
        (x.position.jackpotPaid ? x.window.jackpotShare : 0n) >
      principal(x.position),
  );
  const winKey = wins?.map((x) => String(x.k)).join(",") ?? "";
  useEffect(() => {
    if (winKey && celebrated.current !== winKey) {
      celebrated.current = winKey;
      setFlash(true);
      blip(true);
      const timer = setTimeout(() => setFlash(false), 2600);
      return () => clearTimeout(timer);
    }
  }, [winKey]);
  async function claimAll() {
    setNote("");
    let count = 0;
    for (const row of rows ?? []) {
      const amount = await reader(r)<bigint>("claimable", [row.k, address]);
      if (amount === 0n) continue;
      setNote(`Claim ${count + 1}: confirm this hour in your wallet.`);
      if (!(await tx.run("claim", [row.k]))) {
        setNote(
          `${count} ${count === 1 ? "hour" : "hours"} claimed. Remaining claims are still available.`,
        );
        return;
      }
      count++;
    }
    setNote(`${count} ${count === 1 ? "hour" : "hours"} claimed.`);
    await bets.refetch();
  }
  return (
    <section className="card my-bets" id="my-bets">
      <CardHead
        title="My bets"
        help="Only the connected wallet’s v2 bets appear here, discovered from on-chain events. Claim all submits a separate claim transaction for each payable hour. A jackpot can become claimable later, even after the original claim. Claims do not expire. Losses are recorded by lossOf; there is no HAMSTER reward token available yet."
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
      ) : eventError || bets.isError ? (
        <Empty>
          <p>Your bets could not load. No balances have been changed.</p>
          <button
            onClick={() => {
              void cache.invalidateQueries({ queryKey: ["events"] });
              void bets.refetch();
            }}
          >
            Try again
          </button>
        </Empty>
      ) : !events || bets.isLoading ? (
        <Empty>Finding your bets on Ethereum…</Empty>
      ) : !rows?.length ? (
        <Empty>
          <h3>A fresh start.</h3>
          <p>Your confirmed bets will appear here.</p>
          <a className="button" href="#play">
            Make your first pick ↗
          </a>
        </Empty>
      ) : (
        <>
          {wins && wins.length > 0 && (
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
                void claimAll().catch(() =>
                  setNote("The claim check failed. Refresh and try again."),
                )
              }
            >
              Claim all
            </button>
          </div>
          <p className="small muted">
            One wallet confirmation and network fee per payable hour.
          </p>
          <ul className="bet-list" tabIndex={0} aria-label="Your bet history">
            {rows.map((x) => (
              <li key={String(x.k)}>
                <div>
                  <strong>{span(x.window)} your time</strong>
                  <span>
                    {[
                      ["Over", x.position.over],
                      ["Under", x.position.under],
                      ["Snooze yes", x.position.yes],
                      ["Snooze no", x.position.no],
                    ]
                      .filter(([, v]) => v !== 0n)
                      .map(([s, v]) => `${s} · ${imd(v as bigint)} IMD`)
                      .join(" / ")}
                    {x.position.hasTicket
                      ? ` · Ticket ${x.position.guess}`
                      : ""}
                  </span>
                </div>
                <div>
                  <strong>
                    {x.claimable > 0n
                      ? `${imd(x.claimable)} IMD`
                      : x.window.status === 3
                        ? "Refunded"
                        : x.window.status === 2
                          ? x.position.paid > 0n
                            ? "Claimed"
                            : x.window.jackpotFinalized
                              ? "Settled"
                              : "Jackpot pending"
                          : "Awaiting result"}
                  </strong>
                  {x.claimable > 0n && (
                    <button
                      disabled={tx.busy}
                      onClick={() => void tx.run("claim", [x.k])}
                    >
                      Claim
                    </button>
                  )}
                  {x.loss > 0n && (
                    <small>{imd(x.loss)} IMD eligible loss</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <TransactionStatus r={r} />
      <p role="status" className="small">
        {note}
      </p>
    </section>
  );
}
