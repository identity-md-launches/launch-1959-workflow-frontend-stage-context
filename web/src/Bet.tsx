import { useRef, useState } from "react";
import { useConnection } from "wagmi";
import { erc20Abi } from "viem";
import type { Runtime } from "./config";
import {
  useToken,
  useWindow,
  useJackpot,
  type GlobalState,
  reader,
  loadWindow,
} from "./data";
import {
  amount,
  uint,
  units,
  winnersPool,
  payoutMultiple,
  countdown,
  dateTime,
  errorText,
} from "./model";
import { useTransactions } from "./transactions";
import { Action, Field, ErrorNote } from "./ui";
import { Stream } from "./Stream";
import { Sheet } from "./Sheet";
import { MyBets } from "./MyBets";
export type PageProps = {
  r: Runtime;
  g?: GlobalState;
  ready: boolean;
  now: number;
};
type Choice = "OVER" | "UNDER" | "SLEEPING" | "RUNNING" | "EXACT";
export function Bet({ r, g, ready, now }: PageProps) {
  const { address } = useConnection();
  const [customWindow, setCustomWindow] = useState<bigint>();
  const k = customWindow ?? g?.candidate;
  const w = useWindow(r, k, address),
    token = useToken(r, g?.IMD, address),
    jackpot = useJackpot(r, g);
  const { send, busy } = useTransactions();
  const [choice, setChoice] = useState<Choice>(),
    [size, setSize] = useState("1"),
    [guess, setGuess] = useState("");
  const [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [windowInput, setWindowInput] = useState(""),
    [windowError, setWindowError] = useState("");
  const flow = useRef(false);
  const line =
    w.data?.window.status === 0 ? g?.currentLine : w.data?.window.line;
  const closes =
    g && k !== undefined && w.data
      ? w.data.times[0] < g.genesisTimestamp + k * 3600n
        ? w.data.times[0]
        : g.genesisTimestamp + k * 3600n
      : undefined;
  const open =
    !!w.data?.open &&
    closes !== undefined &&
    BigInt(Math.floor(now / 1000)) < closes;
  const market =
    choice === "EXACT"
      ? 1
      : choice === "SLEEPING" || choice === "RUNNING"
        ? 2
        : 0;
  const side = choice === "OVER" || choice === "SLEEPING";
  const fresh =
    !w.isError &&
    Date.now() - w.dataUpdatedAt < 45000 &&
    !token.isError &&
    Date.now() - token.dataUpdatedAt < 45000;
  const ticketOwned =
    market === 1 && (w.data?.position?.exactAmount ?? 0n) > 0n;
  const full =
    market === 1 && !!g && !!w.data && w.data.entries >= g.MAX_EXACT_ENTRIES;
  const disabled =
    !ready ||
    !fresh ||
    !open ||
    !!phase ||
    ticketOwned ||
    full ||
    token.data?.balance === undefined ||
    token.data?.allowance === undefined;
  const reason =
    !ready || !fresh
      ? "Reading the latest game and wallet balance…"
      : !open
        ? "Betting closed. Choose the next window below."
        : ticketOwned
          ? "You already have an exact guess in this window."
          : full
            ? "All exact guesses are taken for this window."
            : undefined;
  function choose(value: Choice) {
    setChoice(value);
    setError("");
    setSuccess("");
    setPhase("");
  }
  async function submit() {
    if (flow.current || busy) return;
    flow.current = true;
    setError("");
    setPhase("Checking…");
    try {
      if (
        disabled ||
        !g ||
        !w.data ||
        !token.data ||
        !address ||
        k === undefined ||
        !choice
      )
        throw Error("Wait for the latest game data before placing a bet.");
      const betChoice = choice,
        betMarket = market,
        betSide = side,
        betWindow = k;
      const value = amount(size, token.data.decimals);
      if (value < g.MIN_BET)
        throw Error(`The minimum bet is ${units(g.MIN_BET)} IMD.`);
      if (value > token.data.balance!)
        throw Error("You need more IMD for this bet. Choose a smaller amount.");
      if (value > g.MAX_POOL - w.data.window.pools[market])
        throw Error("This amount exceeds the remaining pool space.");
      const exactGuess = market === 1 ? uint(guess) : 0n;
      const allowance = await r.client.readContract({
        address: g.IMD,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, r.game.address],
      });
      if (allowance < value) {
        setPhase("Approving…");
        if (
          allowance > 0n &&
          !(await send("bet", {
            address: g.IMD,
            abi: erc20Abi,
            functionName: "approve",
            args: [r.game.address, 0n],
          }))
        )
          return;
        if (
          !(await send("bet", {
            address: g.IMD,
            abi: erc20Abi,
            functionName: "approve",
            args: [r.game.address, value],
          }))
        )
          return;
      }
      setPhase("Placing…");
      if (!(await reader(r)<boolean>("isBettingOpen", [betWindow])))
        throw Error(
          "Betting closed while you approved. Your IMD is still in your wallet.",
        );
      if (
        await send("bet", {
          functionName:
            betMarket === 0
              ? "betOverUnder"
              : betMarket === 1
                ? "betExact"
                : "betSleep",
          args: [betWindow, betMarket === 1 ? exactGuess : betSide, value],
        })
      ) {
        let message =
          betMarket === 1
            ? "Bet placed. Your exact guess is in."
            : `Bet placed. You’re on ${betChoice}.`;
        if (betMarket !== 1) {
          try {
            const latest = await loadWindow(r, betWindow, address);
            const sides =
              betMarket === 0 ? latest.window.over : latest.window.sleep;
            const bets =
              betMarket === 0 ? latest.position!.over : latest.position!.sleep;
            const weight = bets[betSide ? 1 : 0];
            const estimate =
              sides[betSide ? 0 : 1] === 0n
                ? weight
                : (winnersPool(latest.window.pools[betMarket]) * weight) /
                  sides[betSide ? 1 : 0];
            message = `Bet placed. You win about ${units(estimate)} IMD if ${betChoice}.`;
          } catch {
            /* The confirmed bet remains successful if the estimate cannot refresh. */
          }
        }
        setSuccess(message);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      flow.current = false;
      setPhase("");
    }
  }
  function pays(c: Choice) {
    if (!w.data) return "Reading pool…";
    const pair =
      c === "SLEEPING" || c === "RUNNING"
        ? w.data.window.sleep
        : w.data.window.over;
    const idx = c === "OVER" || c === "SLEEPING" ? 1 : 0;
    const total = pair[0] + pair[1];
    if (!total) return "No bets yet";
    if (!pair[0] || !pair[1]) return "One side: refund";
    return `pays x${payoutMultiple(total, pair[idx], pair[1 - idx]).replace("×", "")}`;
  }
  return (
    <>
      <div className="play-layout">
        <div className="watch-zone">
          <Stream />
          <div className="desktop-hero">
            <img
              src="./assets/hamster-wheel.svg"
              width="300"
              height="234"
              alt="Pixel hamster running in a glowing wheel"
            />
            <div>
              <h2>
                Small hamster.
                <br />
                Big decisions.
              </h2>
              <p className="muted">
                Watch the wheel.
                <br />
                Pick your side.
              </p>
              <span className="pool-number">
                {w.data
                  ? units(w.data.window.pools.reduce((a, b) => a + b, 0n))
                  : "…"}{" "}
                IMD
              </span>
              <p className="small muted">in this window’s pools</p>
            </div>
          </div>
        </div>
        <section className="play-panel" aria-label="Bet on the next hour">
          <div className="play-heading">
            <h2>Bet on the next hour</h2>
            <span className="small muted">#{k?.toString() ?? "…"}</span>
          </div>
          <div className="game-clock">
            <div>
              <span className="small muted">
                {open ? "Place your bet in" : "Betting closes in"}
              </span>
              <strong className="countdown">
                {countdown(closes, now).replace(/^00:/, "")}
              </strong>
            </div>
            <div className="line-value">
              <span className="small muted">The line</span>
              <strong>{line?.toString() ?? "…"}</strong>
              <span className="small muted">wheel passes</span>
            </div>
          </div>
          <div className="market-buttons">
            {(["OVER", "UNDER", "SLEEPING"] as Choice[]).map((c) => (
              <div className="market-choice" key={c}>
                <button
                  className="market-button"
                  onClick={() => choose(c)}
                  aria-label={`Bet ${c}`}
                >
                  <span>{c}</span>
                  <span className="small">
                    {c === "SLEEPING"
                      ? "0 passes"
                      : `${c === "OVER" ? ">" : "<"} ${line?.toString() ?? "…"}`}
                  </span>
                </button>
                <span className="pays">{pays(c)}</span>
              </div>
            ))}
          </div>
          <p className="game-description">
            Bet IMD on how far the hamster runs in the next hour. Winners share
            the pool. Verified by the IMD oracle.
          </p>
          <p className="coming-soon">Lose a bet, mine $HAMSTER. Coming soon.</p>
          <button
            className="text-button exact-link"
            onClick={() => choose("EXACT")}
          >
            Guess the exact number <span aria-hidden="true">→</span>
          </button>
          {w.data && w.data.window.pools.every((p) => p === 0n) && (
            <p className="empty-line">No bets yet, be first</p>
          )}
          {w.data && !open && (
            <p className="notice">
              Betting closed, next window opens in{" "}
              {countdown(
                g
                  ? g.genesisTimestamp + (g.currentWindow + 1n) * 3600n
                  : undefined,
                now,
              ).replace(/^00:/, "")}{" "}
              <button
                className="text-button"
                onClick={() => setCustomWindow(undefined)}
              >
                Next window
              </button>
            </p>
          )}
          <details className="how-it-works">
            <summary>How it works</summary>
            <p>
              Choose OVER or UNDER the line, or SLEEPING for zero wheel passes.
              Bets close before the next hour starts. Six 10-minute rounds make
              one window.
            </p>
            <p>
              These are shared pools (pari-mutuel): your payout changes as bets
              arrive. In each contested market, 91% goes to winners, 5% to
              stakers, 3% to the oracle reserve and 1% to TEAM. Fees round down
              on chain.
            </p>
            <p>
              One-sided binary markets and a result equal to the line are
              refunded. SLEEPING has its own pool, separate from OVER and UNDER.
            </p>
            <button className="text-button" onClick={() => choose("RUNNING")}>
              Bet RUNNING: at least one pass
            </button>
            <p>
              EXACT pays the three nearest distinct distances, with ties split
              by ticket. One guess per wallet; it cannot be changed. An
              uncontested exact ticket cannot win the jackpot.
            </p>
            <p>
              The IMD oracle supplies a signed attestation. Anyone can settle a
              finished window. If no accepted result arrives within 48 hours,
              bets can be refunded. No $HAMSTER is mined yet.
            </p>
            <p>
              Available jackpot:{" "}
              {g?.jackpotToken && !/^0x0+$/.test(g.jackpotToken)
                ? jackpot.data
                  ? `${units(jackpot.data.available, jackpot.data.decimals)} ${jackpot.data.symbol}`
                  : "Reading token…"
                : "Not enabled yet"}
              .
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
            </dl>
            <Field label="Choose a window" id="bet-window">
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
                    setCustomWindow(uint(windowInput, 64));
                    setWindowError("");
                  } catch (e) {
                    setWindowError(errorText(e));
                  }
                }}
              >
                Load window
              </button>
              <button onClick={() => setCustomWindow(undefined)}>
                Next open window
              </button>
            </div>
            <ErrorNote message={windowError} />
          </details>
        </section>
      </div>
      <MyBets r={r} g={g} ready={ready} now={now} />
      {choice && (
        <Sheet
          locked={!!phase}
          title={success ? "You’re in." : `Bet ${choice}`}
          close={() => {
            if (!flow.current) setChoice(undefined);
          }}
        >
          {success ? (
            <div className="bet-success">
              <img
                src="./assets/hamster-happy.svg"
                width="100"
                height="100"
                alt="Happy hamster"
              />
              <p role="status">{success}</p>
              <p className="small muted">
                Estimated total return, including your bet. Pools can change. A
                one-sided pool is refunded.
              </p>
              <button className="primary" onClick={() => setChoice(undefined)}>
                Back to the wheel
              </button>
            </div>
          ) : (
            <>
              <p className="muted">
                Window {k?.toString() ?? "…"} ·{" "}
                {choice === "EXACT"
                  ? "Closest guesses share the pool"
                  : choice === "SLEEPING"
                    ? "No wheel passes"
                    : choice === "RUNNING"
                      ? "At least one wheel pass"
                      : `${choice === "OVER" ? "More" : "Fewer"} than ${line?.toString() ?? "…"} passes`}
              </p>
              {choice === "EXACT" && (
                <Field
                  label="Your guess · total passes"
                  id="exact-guess"
                  hint="One ticket per wallet. Equal-distance tickets share equally."
                >
                  <input
                    id="exact-guess"
                    value={guess}
                    inputMode="numeric"
                    onChange={(e) => setGuess(e.target.value)}
                    disabled={!!phase}
                  />
                </Field>
              )}
              <div className="amount-label">
                <label htmlFor="bet-amount">Bet amount</label>
                <span className="small muted">
                  {address
                    ? token.data?.balance === undefined
                      ? "Reading balance…"
                      : `${units(token.data.balance)} IMD available`
                    : "Minimum 0.5 IMD"}
                </span>
              </div>
              <div className="amount-input">
                <input
                  id="bet-amount"
                  inputMode="decimal"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  disabled={!!phase}
                />
                <span>IMD</span>
              </div>
              <div
                className="amount-chips"
                role="group"
                aria-label="Choose IMD amount"
              >
                {[1, 5, 10, 25].map((n) => (
                  <button
                    key={n}
                    aria-pressed={size === String(n)}
                    disabled={!!phase}
                    onClick={() => setSize(String(n))}
                  >
                    {n} IMD
                  </button>
                ))}
              </div>
              <ErrorNote message={error} />
              <p className="flow-status" role="status">
                {phase}
              </p>
              <Action
                r={r}
                id="bet"
                label="Place bet"
                disabled={disabled}
                reason={reason}
                onClick={() => void submit()}
              />
              <p className="small muted">
                Your wallet may ask for an IMD approval, then your bet. Both
                need ETH for network fees. We approve only this amount.
              </p>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
