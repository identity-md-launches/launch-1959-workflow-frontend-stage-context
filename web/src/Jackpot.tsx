import { useState } from "react";
import { useConnection } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "./config";
import {
  reader,
  useToken,
  useWindow,
  type GlobalState,
  type GameEvent,
} from "./data";
import {
  imd,
  amountValue,
  dateLabel,
  shortAddress,
  span,
  time,
  type GameWindow,
  type Position,
} from "./model";
import { useTransaction, TransactionStatus } from "./transactions";
import { useWalletControl } from "./Wallet";
import { CardHead, Icon } from "./ui";
import { Jar } from "./pixel";
import { Sheet } from "./Sheet";
import { blip } from "./sound";
export function Jackpot({
  r,
  g,
  k,
  events,
  eventError = false,
  compact = false,
  setK,
}: {
  r: Runtime;
  g?: GlobalState;
  k?: bigint;
  events?: GameEvent[];
  eventError?: boolean;
  compact?: boolean;
  setK?: (k: bigint) => void;
}) {
  const [mode, setMode] = useState<"ticket" | "feed">(),
    [guess, setGuess] = useState("2100"),
    [feed, setFeed] = useState("5"),
    [error, setError] = useState("");
  const { address, chainId } = useConnection(),
    token = useToken(r, address),
    selected = useWindow(r, k),
    tx = useTransaction(),
    wallet = useWalletControl();
  const feeds = (events ?? [])
    .filter((e) => e.eventName === "Fed")
    .slice(-4)
    .reverse();
  const lastHit = [...(events ?? [])]
    .reverse()
    .find((e) => e.eventName === "JackpotFinalized" && e.args.winners > 0n);
  const hit = useQuery({
    queryKey: ["last-hit", lastHit?.transactionHash],
    enabled: !!lastHit,
    queryFn: async () => {
      const w = await reader(r)<GameWindow>("windowInfo", [lastHit!.args.k]);
      const ticket = events?.find(
        (e) =>
          e.eventName === "TicketBought" &&
          e.args.k === lastHit!.args.k &&
          (e.args.guess > w.result
            ? e.args.guess - w.result
            : w.result - e.args.guess) *
            200n <=
            w.result,
      );
      const block = await r.client.getBlock({
        blockNumber: lastHit!.blockNumber,
      });
      return {
        w,
        winner: ticket?.args.bettor as string | undefined,
        at: block.timestamp,
      };
    },
  });
  const position = useQuery({
    queryKey: ["ticket-position", address, k?.toString()],
    enabled: !!address && k !== undefined,
    queryFn: () => reader(r)<Position>("position", [k, address]),
    refetchInterval: 15000,
  });
  const next = useQuery({
    queryKey: ["jackpot-next", g?.earliestNotStartedWindow.toString()],
    enabled: !!g,
    queryFn: () =>
      reader(r)<GameWindow>("windowInfo", [g!.earliestNotStartedWindow]),
    refetchInterval: 15000,
  });
  let cost = 5000000000000000000n;
  try {
    if (mode === "feed") cost = amountValue(feed);
  } catch {
    cost = 0n;
  }
  const approved = !!token.data && cost > 0n && token.data.allowance >= cost;
  async function submit() {
    setError("");
    if (!address) {
      wallet.open();
      return;
    }
    if (chainId !== 1) {
      await wallet.switchChain();
      return;
    }
    let n: bigint;
    try {
      n = mode === "feed" ? amountValue(feed) : 5000000000000000000n;
      if (
        mode === "ticket" &&
        (!/^\d+$/.test(guess) || BigInt(guess) > (1n << 64n) - 1n)
      )
        throw Error(
          "Enter a whole-number guess from 0 to 18446744073709551615.",
        );
      if (!token.data || token.data.balance < n)
        throw Error("Not enough IMD for this action.");
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!approved) {
      await tx.run("approve", [r.game.address, n], true);
      return;
    }
    const ok = await tx.run(
      mode === "feed" ? "feedHamster" : "buyTicket",
      mode === "feed" ? [n] : [k, BigInt(guess)],
    );
    if (ok) {
      setMode(undefined);
      blip();
    }
  }
  const pot = g
    ? g.jackpotSeed + g.totalPendingJackpotDeposits
    : undefined;
  const fixedPrize = next.data?.jackpotFinalized
    ? `${imd(next.data.jackpotShare)} IMD per winner`
    : "Fixes after the result";
  return (
    <section
      className={compact ? "jackpot-strip" : "card jackpot"}
      aria-label={compact ? "Jackpot" : undefined}
    >
      {compact ? (
        <>
          <div>
            <span>Jackpot</span>
            <strong className="pixel">
              {imd(pot)} <small>IMD</small>
            </strong>
            <span className="jackpot-next-prize">Next hour’s fixed prize: {fixedPrize}</span>
          </div>
          <button
            className="butter-button"
            onClick={() => {
              setMode("ticket");
              setError("");
            }}
          >
            Guess the exact number · 5 IMD
          </button>
          <a href="#jackpot">See jackpot ↗</a>
        </>
      ) : (
        <>
          {g && setK && (
            <div className="jackpot-hour">
              <label htmlFor="jackpot-hour">Betting hour · your time</label>
              <select
                id="jackpot-hour"
                value={k?.toString() ?? ""}
                onChange={(e) => setK(BigInt(e.target.value))}
              >
                {Array.from(
                  { length: 24 },
                  (_, i) => g.earliestNotStartedWindow + BigInt(i),
                ).map((n, i) => {
                  const start = g.GENESIS + n * 3600n;
                  return (
                    <option key={String(n)} value={String(n)}>
                      {i === 0 ? "Next · " : ""}
                      {new Date(Number(start) * 1000).toLocaleDateString(
                        undefined,
                        { weekday: "short" },
                      )}{" "}
                      {time(start)}–{time(start + 3600n)}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <CardHead
            title="The jackpot jar"
            help="A ticket costs 5 IMD. Guess within ±0.5% of the final passes: winners split 80% of the pot, with 20% carried. No winner or fewer than 100 passes carries everything. A timeout refunds tickets. One ticket per wallet per hour, 256 tickets maximum. Final prizes are fixed only after ordered finalization."
          />
          <div className="jackpot-main">
            <div>
              <span className="jackpot-label">Waiting for a lucky guess</span>
              <strong className="jackpot-counter pixel">
                {imd(pot)}
                <small> IMD</small>
              </strong>
              <span className="jackpot-sub">
                Carried seed + all pending jackpot deposits
              </span>
            </div>
            <Jar
              fill={
                pot === undefined
                  ? 0
                  : Math.min(1, Number(pot / 1000000000000000000n) / 100)
              }
            />
          </div>
          <p className="jackpot-rule">
            Get within ±0.5%. Share <strong>80% of the jar.</strong>
          </p>
          <div className="jackpot-details">
            <div>
              <span>Next hour’s fixed prize</span>
              <strong>
                {fixedPrize}
              </strong>
            </div>
            <div>
              <span>Last winner</span>
              <strong>
                {hit.data ? (
                  <>
                    <span>
                      {hit.data.winner
                        ? shortAddress(hit.data.winner)
                        : `${hit.data.w.jackpotWinners} winning tickets`}
                    </span>
                    <small>{dateLabel(hit.data.at)}</small>
                  </>
                ) : eventError ? (
                  "History unavailable"
                ) : !events ? (
                  "Reading history…"
                ) : (
                  "No jackpot hit yet"
                )}
              </strong>
            </div>
          </div>
          <div className="jackpot-actions">
            <button
              className="butter-button"
              onClick={() => {
                setMode("ticket");
                setError("");
              }}
            >
              <Icon name="seed" /> Get a ticket · 5 IMD
            </button>
            <button
              className="feed-button"
              onClick={() => {
                setMode("feed");
                setError("");
              }}
            >
              Feed the hamster ↗
            </button>
          </div>
          <p className="carry-note">
            No winner? It grows. Asleep? It rolls over.
          </p>
          <div className="fed-list">
            <span>With a little help from</span>
            {feeds.length ? (
              feeds.map((e) => (
                <a
                  href={`${r.deployment.network.explorer}/tx/${e.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  key={e.transactionHash + e.logIndex}
                >
                  Fed by {shortAddress(e.args.from)}{" "}
                  <strong>+{imd(e.args.amount)} IMD</strong>
                </a>
              ))
            ) : (
              <p>
                {eventError
                  ? "Feeds could not load."
                  : !events
                    ? "Reading the latest feeds…"
                    : "No feeds yet. Every seed counts."}
              </p>
            )}
          </div>
        </>
      )}
      {mode && (
        <Sheet
          title={mode === "feed" ? "Feed the hamster" : "Make your lucky guess"}
          close={() => setMode(undefined)}
          locked={tx.busy}
        >
          {mode === "feed" ? (
            <>
              <p>
                90% fills the next hour’s jackpot. 10% goes to the Squeektoshi
                tip jar. This is a donation.
              </p>
              <label htmlFor="feed-amount">Amount in IMD</label>
              <input
                id="feed-amount"
                inputMode="decimal"
                value={feed}
                onChange={(e) => setFeed(e.target.value)}
              />
            </>
          ) : (
            <>
              <p>
                A 5 IMD ticket for{" "}
                {selected.data
                  ? `${span(selected.data.window)} your time`
                  : "the selected betting hour"}
                . Your guess wins within ±0.5% of the settled count. One ticket
                per wallet.
              </p>
              <label htmlFor="ticket-guess">Your guess, in passes</label>
              <input
                id="ticket-guess"
                inputMode="numeric"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              />
              {position.data?.hasTicket && (
                <p className="error">
                  You already have a ticket for this hour:{" "}
                  {position.data.guess.toLocaleString("en-US")} passes.
                </p>
              )}
            </>
          )}
          <p className="small">
            Approval covers exactly {imd(cost)} IMD. Ethereum network fees are
            extra.
          </p>
          <button
            className="primary"
            disabled={
              tx.busy ||
              (mode === "ticket" &&
                (k === undefined || position.data?.hasTicket === true))
            }
            onClick={() => void submit()}
          >
            {!address
              ? "Connect wallet"
              : chainId !== 1
                ? "Switch to Ethereum"
                : !approved
                  ? `Approve ${imd(cost)} IMD`
                  : mode === "feed"
                    ? `Donate ${feed} IMD`
                    : "Buy ticket · 5 IMD"}
          </button>
          <TransactionStatus r={r} />
          <p className="error" role="status">
            {error}
          </p>
        </Sheet>
      )}
    </section>
  );
}
