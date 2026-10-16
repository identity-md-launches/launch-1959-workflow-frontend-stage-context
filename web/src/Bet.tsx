import { useState } from "react";
import { useConnection } from "wagmi";
import { erc20Abi, formatUnits, type Address } from "viem";
import type { Runtime } from "./config";
import { useToken, useWindow, type GlobalState, same } from "./data";
import {
  amount,
  uint,
  units,
  payoutMultiple,
  dateTime,
  errorText,
} from "./model";
import { useTransactions } from "./transactions";
import { Action, Field, ErrorNote, Stat } from "./ui";
export type PageProps = {
  r: Runtime;
  g?: GlobalState;
  ready: boolean;
  now: number;
};
export function Bet({
  r,
  g,
  ready,
  now,
  k,
  setK,
}: {
  r: Runtime;
  g?: GlobalState;
  ready: boolean;
  now: number;
  k?: bigint;
  setK: (k: bigint | undefined) => void;
}) {
  const { address } = useConnection();
  const w = useWindow(r, k, address);
  const token = useToken(r, g?.IMD, address);
  const { send, busy } = useTransactions();
  const [market, setMarket] = useState<0 | 1 | 2>(0),
    [side, setSide] = useState(true),
    [size, setSize] = useState("0.5"),
    [guess, setGuess] = useState(""),
    [windowInput, setWindowInput] = useState(""),
    [error, setError] = useState("");
  let parsed: bigint | undefined;
  try {
    parsed = amount(size, token.data?.decimals ?? 18);
  } catch {
    /* input errors shown on submit */
  }
  const balance = token.data?.balance,
    allowance = token.data?.allowance;
  const needsApproval =
    parsed !== undefined && allowance !== undefined && allowance < parsed;
  const resetApproval = needsApproval && allowance !== 0n;
  const open =
    !!w.data?.open &&
    !!g &&
    !!w.data &&
    BigInt(Math.floor(now / 1000)) <
      (w.data.times[0] < g.genesisTimestamp + (k ?? 0n) * 3600n
        ? w.data.times[0]
        : g.genesisTimestamp + (k ?? 0n) * 3600n);
  const fresh =
    Date.now() - w.dataUpdatedAt < 45000 &&
    !w.isError &&
    Date.now() - token.dataUpdatedAt < 45000 &&
    !token.isError;
  const line =
    w.data?.window.status === 0 ? g?.currentLine : w.data?.window.line;
  const sides = market === 0 ? w.data?.window.over : w.data?.window.sleep;
  const pools = w.data?.window.pools;
  const label = needsApproval
    ? resetApproval
      ? "Reset IMD allowance"
      : `Approve ${size} IMD`
    : `Place ${market === 0 ? "over / under" : market === 1 ? "exact" : "sleep"} bet`;
  const ticketOwned =
    market === 1 && (w.data?.position?.exactAmount ?? 0n) > 0n;
  const full =
    market === 1 && g && w.data && w.data.entries >= g.MAX_EXACT_ENTRIES;
  const disabled =
    !ready ||
    !fresh ||
    !open ||
    balance === undefined ||
    allowance === undefined ||
    !!ticketOwned ||
    !!full;
  let reason =
    !ready || !fresh
      ? "Waiting for verified, current contract state."
      : !open
        ? "Betting is closed. Select the next open window."
        : ticketOwned
          ? "Your EXACT ticket is fixed for this window."
          : full
            ? "All 256 EXACT tickets have been taken."
            : balance === undefined
              ? "Your IMD balance is unavailable."
              : undefined;
  async function submit() {
    setError("");
    try {
      if (
        !ready ||
        !g ||
        !w.data ||
        !token.data ||
        k === undefined ||
        disabled ||
        busy
      )
        throw Error("Refresh contract state before continuing.");
      const value = amount(size, token.data.decimals);
      if (value < g.MIN_BET)
        throw Error(
          `The minimum bet is ${units(g.MIN_BET, token.data.decimals)} IMD.`,
        );
      if (value > (balance ?? 0n))
        throw Error("This bet exceeds your available IMD balance.");
      if (value > g.MAX_POOL - w.data.window.pools[market])
        throw Error("This amount exceeds the remaining market capacity.");
      const exactGuess = market === 1 ? uint(guess) : 0n;
      if (needsApproval) {
        await send("bet", {
          address: g.IMD,
          abi: erc20Abi,
          functionName: "approve",
          args: [r.game.address, resetApproval ? 0n : value],
        });
        return;
      }
      await send("bet", {
        functionName:
          market === 0
            ? "betOverUnder"
            : market === 1
              ? "betExact"
              : "betSleep",
        args: [k, market === 1 ? exactGuess : side, value],
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <div className="work-grid">
        <section className="bet-panel" aria-label="Place a bet">
          <div className="section-title">
            <h2>Bet on the next hour</h2>
            <span className="small muted">Window {k?.toString() ?? "…"}</span>
          </div>
          <div className="segmented" role="group" aria-label="Bet market">
            {(["Over / under", "Exact", "Sleep"] as const).map((name, i) => (
              <button
                key={name}
                aria-pressed={market === i}
                onClick={() => {
                  setMarket(i as 0 | 1 | 2);
                  setError("");
                }}
              >
                {name}
              </button>
            ))}
          </div>
          {market === 1 ? (
            <Field
              label="Your guess · total passes"
              id="exact-guess"
              hint="One ticket per wallet. Closest guesses share the prize."
            >
              <input
                id="exact-guess"
                inputMode="numeric"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Enter a whole number"
              />
            </Field>
          ) : (
            <div
              className="side-options"
              role="group"
              aria-label={
                market === 0 ? "Over or under" : "Will the hamster sleep?"
              }
            >
              {[true, false].map((value) => (
                <button
                  className={side === value ? "selected" : ""}
                  aria-pressed={side === value}
                  key={String(value)}
                  onClick={() => setSide(value)}
                >
                  <span className="side-name">
                    {market === 0
                      ? value
                        ? "Over"
                        : "Under"
                      : value
                        ? "Yes, asleep"
                        : "No, running"}
                    <span aria-hidden="true">{side === value ? "●" : "○"}</span>
                  </span>
                  <span className="side-detail">
                    {market === 0
                      ? `${value ? ">" : "<"} ${line?.toString() ?? "…"} passes`
                      : value
                        ? "Zero passes"
                        : "At least one pass"}
                  </span>
                  <span className="side-pool">
                    {sides
                      ? `${units(sides[value ? 1 : 0])} IMD`
                      : "Pool loading…"}
                  </span>
                  <span className="small muted">
                    {sides && pools
                      ? payoutMultiple(
                          pools[market],
                          sides[value ? 1 : 0],
                          sides[value ? 0 : 1],
                        )
                      : "Payout unavailable"}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="amount-label">
            <label htmlFor="bet-amount">Bet amount</label>
            <span className="small muted">
              {address
                ? `Balance ${units(balance, token.data?.decimals)} IMD`
                : "Minimum 0.5 IMD"}
            </span>
          </div>
          <div className="amount-input">
            <input
              id="bet-amount"
              inputMode="decimal"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              aria-describedby="bet-help bet-error"
            />
            <span>IMD</span>
          </div>
          <ErrorNote id="bet-error" message={error} />
          <Action
            r={r}
            id="bet"
            label={label}
            onClick={() => void submit()}
            disabled={disabled}
            reason={reason}
          />
          <p id="bet-help" className="small muted">
            {market === 1
              ? "Tied tickets split equally, regardless of stake."
              : "Payouts change as bets arrive. One-sided markets refund."}
          </p>
          {needsApproval && (
            <p className="small muted">
              {resetApproval
                ? "Reset the existing allowance to zero first. Then approve the exact bet amount."
                : "Step 1: allow the game to spend this amount. Step 2: place your bet."}
            </p>
          )}
          <details className="inline-details">
            <summary>Window timing & selection</summary>
            <p>
              Rounds {k === undefined ? "…" : `${k * 6n}–${k * 6n + 5n}`}.
              Betting closes before the first round starts.
            </p>
            <dl className="key-values">
              <div>
                <dt>Starts</dt>
                <dd>{dateTime(w.data?.times[0])}</dd>
              </div>
              <div>
                <dt>Ends</dt>
                <dd>{dateTime(w.data?.times[1])}</dd>
              </div>
              <div>
                <dt>Refund deadline</dt>
                <dd>
                  {w.data && g
                    ? dateTime(w.data.times[1] + g.TIMEOUT)
                    : "Unavailable"}
                </dd>
              </div>
            </dl>
            <Field label="Window number" id="bet-window">
              <input
                id="bet-window"
                inputMode="numeric"
                value={windowInput}
                onChange={(e) => setWindowInput(e.target.value)}
              />
            </Field>
            <div className="button-row">
              <button
                onClick={() => {
                  try {
                    setK(uint(windowInput, 64));
                    setError("");
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Load window
              </button>
              <button onClick={() => setK(undefined)}>Next open window</button>
            </div>
          </details>
        </section>
        <aside className="market-panel">
          <h2>Inside the pools</h2>
          <div className="pool-list">
            {["Over / under", "Exact", "Sleep"].map((name, i) => (
              <div key={name}>
                <span>{name}</span>
                <strong>
                  {pools ? units(pools[i]) : "…"}{" "}
                  <span className="muted">IMD</span>
                </strong>
              </div>
            ))}
          </div>
          <div className="pool-total">
            <span>Total this window</span>
            <strong>
              {pools ? units(pools.reduce((a, b) => a + b, 0n)) : "…"} IMD
            </strong>
          </div>
          <h3>Shared pools. Shared upside.</h3>
          <p className="muted">
            91% goes to winners. 5% to stakers, 3% to the oracle reserve, 1% to
            TEAM.
          </p>
          <details>
            <summary>How payouts work</summary>
            <p>
              Over / under and Sleep pay in proportion to your winning stake.
              Equal-to-line Over / under results refund. A one-sided binary
              market refunds without fees.
            </p>
            <p>
              EXACT pays the three closest distance tiers 60%, 30%, 10%. Ties
              split equally. Missing tiers roll into first place. Two tickets
              are needed to win the jackpot.
            </p>
            <p>
              Figures above are implied total-return multiples after fee floors,
              before your new bet. They are not guaranteed odds. A losing bet
              can lose its full stake.
            </p>
          </details>
          <p className="small muted">
            Network fees are paid in ETH. USD values are unavailable.
          </p>
        </aside>
      </div>
      <Claims r={r} g={g} ready={ready} now={now} />
    </>
  );
}
export function Claims({ r, g, ready, now }: PageProps) {
  const { address } = useConnection();
  const [input, setInput] = useState(""),
    [selected, setSelected] = useState<bigint>();
  const [includeJackpot, setIncludeJackpot] = useState(true),
    [error, setError] = useState("");
  const k =
    selected ??
    (g ? (g.currentWindow > 0n ? g.currentWindow - 1n : 0n) : undefined);
  const q = useWindow(r, k, address);
  const { send } = useTransactions();
  const w = q.data?.window,
    p = q.data?.position;
  const final =
    !!w &&
    (w.status >= 2 ||
      (w.status === 1 &&
        !!g &&
        BigInt(Math.floor(now / 1000)) >= w.endsAt + g.TIMEOUT));
  const hasPosition =
    p && [...p.over, ...p.sleep, p.exactAmount].some((n) => n > 0n);
  const beneficiary =
    address && w && g && (same(address, w.settler) || same(address, g.TEAM));
  return (
    <section className="section" aria-labelledby="claim-title">
      <div className="section-title">
        <h2 id="claim-title">Claim a finished window</h2>
        <span className="small muted">Window {k?.toString() ?? "…"}</span>
      </div>
      <div className="claim-grid">
        <div>
          <div className="input-row">
            <Field label="Window number to claim" id="claim-window">
              <input
                id="claim-window"
                inputMode="numeric"
                value={input}
                placeholder={k?.toString()}
                onChange={(e) => setInput(e.target.value)}
              />
            </Field>
            <button
              onClick={() => {
                try {
                  setSelected(uint(input, 64));
                  setError("");
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Look up
            </button>
          </div>
          <ErrorNote message={error} />
          <p className="small muted">
            {q.isPending
              ? "Loading window…"
              : q.isError
                ? "Window read failed. Try another window or refresh."
                : w?.status === 0
                  ? "No bets were placed in this window."
                  : w?.status === 2
                    ? `Settled at ${w.result} passes.`
                    : w?.status === 3
                      ? "Voided. Bets are refundable."
                      : final
                        ? "The settlement deadline passed. Claiming also voids the window."
                        : `Awaiting settlement. Refunds from ${dateTime(w?.endsAt === undefined || !g ? undefined : w.endsAt + g.TIMEOUT)}.`}
          </p>
        </div>
        <div>
          {address && p ? (
            <>
              <div className="stats compact">
                <Stat label="Your total bets">
                  {units(
                    [...p.over, ...p.sleep, p.exactAmount].reduce(
                      (a, b) => a + b,
                      0n,
                    ),
                  )}{" "}
                  IMD
                </Stat>
                <Stat label="IMD claim">
                  {p.imdClaimed ? "Processed" : "Not claimed"}
                </Stat>
              </div>
              {p.exactAmount > 0n && (
                <p className="small">
                  EXACT guess: {p.guess.toString()} passes ·{" "}
                  {units(p.exactAmount)} IMD
                </p>
              )}
            </>
          ) : (
            <p className="muted">Connect to read your bets and claim status.</p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeJackpot}
              onChange={(e) => setIncludeJackpot(e.target.checked)}
            />
            Include jackpot token
          </label>
          <p className="small muted">
            Uncheck to collect IMD if the jackpot token blocks a transfer.
          </p>
          <Action
            r={r}
            id="claim"
            label="Check and claim"
            disabled={
              !ready ||
              !final ||
              q.isError ||
              Date.now() - q.dataUpdatedAt > 45000 ||
              (!hasPosition && !beneficiary)
            }
            reason={
              !final
                ? "Claims open after settlement or the refund deadline."
                : !hasPosition && !beneficiary
                  ? "No bets or settlement role for this account."
                  : undefined
            }
            onClick={() => {
              if (k !== undefined)
                void send("claim", {
                  functionName: "claim",
                  args: [k, includeJackpot],
                });
            }}
          />
        </div>
      </div>
    </section>
  );
}
