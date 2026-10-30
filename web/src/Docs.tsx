import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "./config";
import { useGlobal, useWindow } from "./data";
import { HAMSTER } from "./hamster";
import { imd, number } from "./model";
import { LEADERBOARD_REWARD_TEXT } from "./leaderboard-config";
import {
  PLAY_RULES as rules,
  RULE_SOURCES,
  utcDate,
  utcTime,
} from "./docs-rules";

const chapters = [
  ["welcome", "What is Hamster Hour", "wheel"],
  ["hours", "How an hour works", "clock"],
  ["markets", "Markets", "arrows"],
  ["payouts", "Payouts and fees", "coins"],
  ["refunds", "Refunds and claims", "shield"],
  ["mining", "Mining $HAMSTER", "pick"],
  ["staking", "Staking $HAMSTER", "seed"],
  ["leaderboard", "Leaderboard and rewards", "trophy"],
  ["agents", "For AI agents", "terminal"],
  ["safety", "Contracts and safety", "lock"],
  ["faq", "FAQ", "question"],
] as const;
type PixelName = (typeof chapters)[number][2];

function PixelIcon({ name }: { name: PixelName }) {
  const paths: Record<PixelName, string> = {
    wheel:
      "M4 1h8v2h2v2h2v6h-2v2h-2v2H4v-2H2v-2H0V5h2V3h2zm1 2v2H3v6h2v2h6v-2h2V5h-2V3zM7 4h2v3h3v2H9v3H7V9H4V7h3z",
    clock:
      "M4 1h8v2h2v2h2v6h-2v2h-2v2H4v-2H2v-2H0V5h2V3h2zm0 3v2H2v4h2v2h2v1h4v-1h2v-2h2V6h-2V4h-2V3H6v1zm3 0h2v4h3v2H7z",
    arrows: "M1 1h6v6H5V5L1 9 0 7l4-4H1zm8 8h2v3l4-4 1 2-4 4h3v2H9z",
    coins:
      "M2 1h9v2h2v5h-2v2H2V8H0V3h2zm1 2v5h7V3zm10 3h2v7h-2v2H4v-2h9zM5 4h3v3H5z",
    shield:
      "M7 0h2v2h5v2h2v5h-2v3h-2v2h-2v2H6v-2H4v-2H2V9H0V4h2V2h5zm-5 4v5h2v3h2v2h4v-2h2V9h2V4H9V2H7v2zm2 3h2v2h2V5h2v6H6V9H4z",
    pick: "M4 0h6v2h2v2h2v4h-2V6h-2V4H8v2H6V4H4V2H2V0zm2 6h2v2H6v2H4v2H2v2H0v-4h2V8h2V6z",
    seed: "M7 0h2v2h3v2h2v3h2v5h-2v2h-2v2H4v-2H2v-2H0V7h2V4h2V2h3zm0 4v9h2V4z",
    trophy:
      "M3 0h10v2h3v6h-3v2h-3v3h3v3H3v-3h3v-3H3V8H0V2h3zm0 4H2v2h1zm10 0v2h1V4zM6 2v5h2V2z",
    terminal:
      "M0 1h16v14H0zm2 2v10h12V3zm1 2h2v2h2v2H5v2H3V9h2V7H3zm5 4h4v2H8z",
    lock: "M4 0h8v2h2v5h2v9H0V7h2V2h2zm0 7h8V2H4zm3 3v3h2v-3z",
    question: "M4 0h8v2h2v5h-2v2h-2v2H6V7h4V3H6v2H2V2h2zm2 13h4v3H6z",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function Chapter({
  id,
  children,
  highlight = false,
}: {
  id: (typeof chapters)[number][0];
  children: ReactNode;
  highlight?: boolean;
}) {
  const [, title, icon] = chapters.find(([key]) => key === id)!;
  return (
    <section
      className={`docs-section${highlight ? " docs-important" : ""}`}
      aria-labelledby={`docs-${id}`}
    >
      <h2 id={`docs-${id}`} tabIndex={-1}>
        <span className={`docs-pixel docs-pixel-${icon}`}>
          <PixelIcon name={icon} />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="docs-copy">
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage("Copied");
          } catch {
            setMessage("Select and copy the text above.");
          }
        }}
      >
        Copy
      </button>
      <span role="status">{message}</span>
    </div>
  );
}

function FeeTable({ ticket = false }: { ticket?: boolean }) {
  const split = ticket ? rules.ticket : rules.binary;
  return (
    <table className="docs-fees">
      <caption>
        {ticket ? "EXACT ticket · each 5 IMD" : "Binary markets · total pool"}
      </caption>
      <thead>
        <tr>
          <th scope="col">Goes to</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        {(
          [
            ["Stakers", split.stakers],
            ["Jackpot", split.jackpot],
            ["Oracle reserve", split.oracle],
            ["Team", split.team],
          ] as const
        ).map(([label, pct]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{pct}%</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Winners</th>
          <td>{ticket ? "From the jar*" : `${rules.binary.winners}%`}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Docs({ r }: { r: Runtime }) {
  const global = useGlobal(r),
    g = global.data;
  const current = useWindow(r, g?.currentWindow);
  const next = useWindow(r, g?.earliestNotStartedWindow);
  const mining = useQuery({
    queryKey: ["docs-mining"],
    queryFn: () =>
      r.client.readContract({
        address: HAMSTER.vault,
        abi: HAMSTER.vaultAbi,
        functionName: "currentMiningState",
      }) as Promise<readonly [bigint, bigint, bigint]>,
    refetchInterval: 15000,
    retry: 1,
  });
  const [tocOpen, setTocOpen] = useState(false);
  const [active, setActive] = useState(() => location.hash.slice(1));
  useEffect(() => {
    let frame = 0;
    const jump = () => {
      const id = location.hash.slice(1);
      setActive(id);
      if (!chapters.some(([key]) => id === `docs-${key}`)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const heading = document.getElementById(id);
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: "start", behavior: "instant" });
      });
    };
    jump();
    addEventListener("hashchange", jump);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("hashchange", jump);
    };
  }, []);
  const liveError = global.isError || current.isError || next.isError;
  const fresh = g && !liveError;
  const nextHour = next.data?.window;
  const thisHour = current.data?.window;
  const line = fresh ? (nextHour?.line ?? g.line) : undefined;
  const jar = fresh ? g.jackpotSeed + g.totalPendingJackpotDeposits : undefined;
  const nav = (
    <nav id="docs-contents" aria-label="Guide contents">
      {chapters.map(([id, title], index) => (
        <a
          key={id}
          href={`#docs-${id}`}
          aria-current={active === `docs-${id}` ? "location" : undefined}
          onClick={() => setTocOpen(false)}
        >
          <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          {title}
        </a>
      ))}
    </nav>
  );
  const contracts = [
    ["Game", r.game.address, RULE_SOURCES.game],
    ["HamsterVault", HAMSTER.vault, RULE_SOURCES.vault],
    ["HAMSTER token", HAMSTER.token, RULE_SOURCES.token],
    ["HamsterHook", HAMSTER.hook, RULE_SOURCES.hook],
    ["IMD token", r.token.address, undefined],
  ] as const;
  const examplePool = 15;
  const exampleReturn = (examplePool * rules.binary.winners) / 100;
  return (
    <div className="docs-page">
      <div className="section-intro docs-intro">
        <div>
          <h1>
            How to play<span className="headline-period">.</span>
          </h1>
          <p>Your guide to the wheel.</p>
        </div>
        <a className="button primary" href="#play">
          Make a pick ↗
        </a>
      </div>
      <div className="docs-live" aria-label="Current contract values">
        <dl>
          <div>
            <dt>Line for the next hour</dt>
            <dd data-testid="docs-live-line">
              {line === undefined ? "—" : `${number(line)} passes`}
            </dd>
          </div>
          <div>
            <dt>Jackpot jar</dt>
            <dd data-testid="docs-live-jar">
              {jar === undefined ? "—" : `${imd(jar)} IMD`}
            </dd>
          </div>
          <div>
            <dt>Running hour · UTC</dt>
            <dd data-testid="docs-live-hour">
              {fresh && thisHour
                ? `${utcTime(thisHour.startsAt)}–${utcTime(thisHour.endsAt)}`
                : "—"}
            </dd>
          </div>
        </dl>
        <div className="docs-read-status" role="status">
          {liveError ? (
            <>
              Live values could not refresh. The rules below are still
              available.{" "}
              <button
                onClick={() => {
                  void global.refetch();
                  void current.refetch();
                  void next.refetch();
                }}
              >
                Retry live values
              </button>
            </>
          ) : g ? (
            <>
              Ethereum · checked {utcTime(g.timestamp)} UTC · refreshes every 15
              seconds
            </>
          ) : (
            "Reading Ethereum… The rules below are ready to read."
          )}
        </div>
        <p className="docs-jar-note">Carried seed + all pending deposits.</p>
      </div>
      <div className="docs-layout">
        <aside className={`docs-toc${tocOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="docs-toc-toggle"
            aria-expanded={tocOpen}
            aria-controls="docs-contents"
            onClick={() => setTocOpen(!tocOpen)}
          >
            In this guide <span aria-hidden="true">{tocOpen ? "−" : "+"}</span>
          </button>
          <p className="docs-toc-label">In this guide</p>
          {nav}
        </aside>
        <div className="docs-body">
          <Chapter id="welcome">
            <p>
              A real hamster runs on a wheel; Squeekchain records every pass
              onchain. Each hour is a market: bet IMD on how far it runs, in
              wheel passes. No house takes the other side, no owner can withdraw
              player funds, and the IMD oracle settles results.
            </p>
          </Chapter>
          <Chapter id="hours">
            <ul>
              <li>
                Each hour runs from <strong>:20 to :20 UTC</strong>, starting
                from {utcDate(rules.genesis)}: {rules.rounds} rounds of{" "}
                {rules.roundMinutes} minutes make one window.
              </li>
              <li>
                Betting opens <strong>24 hours before</strong> a window starts
                and closes at its start; you cannot bet on an hour already
                running.
              </li>
              <li>
                The result needs all six published Squeekchain rounds;
                settlement happens when the contract accepts the IMD oracle’s
                signed result after the hour ends and before the{" "}
                {rules.timeoutHours}-hour deadline, with no guaranteed
                settlement minute.
              </li>
              <li>
                The hamster is usually active at night UTC, roughly{" "}
                <strong>21:00–06:00</strong>, and often sleeps during the day,
                so daytime distances tend to be low; this is an observed
                pattern, not a rule or a promise.
              </li>
            </ul>
            <ol
              className="docs-timeline"
              aria-label="An hour from betting to settlement"
            >
              <li>
                <span className="docs-timeline-dot" />
                <strong>Open</strong>
                <span>Up to 24h before</span>
              </li>
              <li>
                <span className="docs-timeline-dot" />
                <strong>Running</strong>
                <span>1 hour · bets closed</span>
              </li>
              <li>
                <span className="docs-timeline-dot" />
                <strong>Result</strong>
                <span>All 6 rounds published</span>
              </li>
              <li>
                <span className="docs-timeline-dot" />
                <strong>Settled</strong>
                <span>Oracle result accepted</span>
              </li>
            </ol>
            <dl className="docs-hour-times">
              <div>
                <dt>Next window starts / betting closes</dt>
                <dd>
                  {fresh && nextHour
                    ? utcDate(nextHour.startsAt)
                    : "Waiting for the next window…"}
                </dd>
              </div>
              <div>
                <dt>That window’s betting opens</dt>
                <dd>
                  {fresh && nextHour
                    ? utcDate(nextHour.startsAt - rules.openAheadSeconds)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>That window ends / settlement can begin</dt>
                <dd>{fresh && nextHour ? utcDate(nextHour.endsAt) : "—"}</dd>
              </div>
              <div>
                <dt>That window’s settlement deadline</dt>
                <dd>{fresh && nextHour ? utcDate(nextHour.timeoutAt) : "—"}</dd>
              </div>
            </dl>
          </Chapter>
          <Chapter id="markets">
            <div className="docs-markets">
              <article className="docs-market">
                <h3>
                  <PixelIcon name="arrows" /> OVER / UNDER
                </h3>
                <ul>
                  <li>
                    The next hour’s line is{" "}
                    <strong>
                      {line === undefined
                        ? "loading from Ethereum"
                        : `${number(line)} passes`}
                    </strong>
                    ; check your chosen hour’s line before betting, because
                    future hours can have different lines.
                  </li>
                  <li>
                    OVER means more than the line; UNDER means at or below it,
                    unless the hour snoozes and both sides are refunded.
                  </li>
                  <li>
                    Minimum bet: <strong>{rules.minBet} IMD</strong> per bet.
                  </li>
                  <li className="docs-example">
                    For example,{" "}
                    {line === undefined
                      ? "a result one pass above the line is OVER, and a result on the line is UNDER"
                      : `${number(line + 1n)} passes is OVER; ${number(line)} is UNDER`}
                    .
                  </li>
                </ul>
              </article>
              <article className="docs-market">
                <h3>
                  <PixelIcon name="clock" /> SNOOZE
                </h3>
                <ul>
                  <li>
                    YES wins below{" "}
                    <strong>{rules.snoozeThreshold} passes</strong>; NO wins at{" "}
                    {rules.snoozeThreshold} or more.
                  </li>
                  <li>
                    Minimum bet: <strong>{rules.minBet} IMD</strong>.
                  </li>
                  <li>
                    If both sides have bets, winners share the pool after fees,
                    in proportion to what they bet.
                  </li>
                  <li className="docs-example">
                    For example, 99 passes means YES wins; exactly 100 means NO
                    wins.
                  </li>
                </ul>
              </article>
              <article className="docs-market">
                <h3>
                  <PixelIcon name="coins" /> EXACT ticket
                </h3>
                <ul>
                  <li>
                    A ticket costs <strong>{rules.ticketPrice} IMD</strong>: one
                    per wallet per hour, up to {rules.maxTickets} tickets for
                    that hour.
                  </li>
                  <li>
                    Guess within <strong>±0.5% of the settled result</strong>,
                    including the boundary; below {rules.snoozeThreshold} passes
                    there are no jackpot winners.
                  </li>
                  <li>
                    Winners split{" "}
                    <strong>{rules.jackpotPayout}% of the jar equally</strong>;
                    the remaining {100 - rules.jackpotPayout}% carries on, or{" "}
                    <strong>100% carries</strong> if nobody wins, with new
                    contributions growing the jar between wins.
                  </li>
                  <li className="docs-example">
                    For example, with a result of 2,000 passes, guesses from
                    1,990 to 2,010 win.
                  </li>
                </ul>
              </article>
            </div>
          </Chapter>
          <Chapter id="payouts">
            <p>
              <strong>Pari-mutuel</strong> means players share a pool: winners
              split the money left after fees, including the losing side’s
              stakes, in proportion to their winning stakes.
            </p>
            <div className="docs-fee-grid">
              <FeeTable />
              <FeeTable ticket />
            </div>
            <p className="docs-footnote">
              *EXACT sends {rules.ticket.jackpot}% into the jar; after
              settlement, the contract fixes prizes in hour order (called
              finalization), and winning tickets split {rules.jackpotPayout}% of
              that jar.
            </p>
            <div className="docs-worked">
              <h3>A small example</h3>
              <p>
                You put 10 IMD on OVER, someone else puts 5 IMD on UNDER, and
                OVER wins without a snooze: the 15 IMD pool pays you{" "}
                <strong>{exampleReturn.toFixed(2)} IMD</strong> (
                {(exampleReturn - 10).toFixed(2)} IMD profit), while UNDER gets{" "}
                <strong>0 IMD</strong>.
              </p>
              <p>
                The other 1.35 IMD is split into 0.75 for stakers, 0.30 for the
                jackpot, 0.15 for the oracle and 0.15 for the team; Ethereum
                network fees are separate.
              </p>
            </div>
          </Chapter>
          <Chapter id="refunds" highlight>
            <ul>
              <li>
                <strong>No other side? You get your stake back.</strong> A
                one-sided binary market is voided with no game fees; OVER/UNDER
                is also fully refunded if the result is below{" "}
                {rules.snoozeThreshold} passes.
              </li>
              <li>
                <strong>No settlement in time?</strong> At {rules.timeoutHours}{" "}
                hours after the hour ends, anyone can mark the window timed out
                onchain, and all its bets and tickets are refundable with no
                game fees.
              </li>
              <li>
                Open <a href="#my-bets">My bets</a>, connect the wallet you
                used, and select <strong>Claim</strong> beside a payable hour or{" "}
                <strong>Claim all</strong> for all payable hours, then confirm
                in your wallet; Claim all sends one transaction per hour and
                jackpot winnings may need a later claim after finalization.
              </li>
              <li>
                <strong>Claims do not expire.</strong> Unclaimed winnings and
                refunds stay in the contract for your wallet until you claim
                them.
              </li>
            </ul>
          </Chapter>
          <Chapter id="mining">
            <p>
              <strong>Lose-to-earn:</strong> eligible IMD lost in binary markets
              mines HAMSTER, starting at{" "}
              <strong>
                {number(BigInt(rules.initialMiningRate))} HAMSTER per IMD
              </strong>{" "}
              and halving every{" "}
              <strong>{number(BigInt(rules.halfLoss))} IMD</strong> of global
              eligible loss across players.
            </p>
            <table className="docs-fees docs-halvings">
              <caption>First four steps of the base mining schedule</caption>
              <thead>
                <tr>
                  <th scope="col">Global eligible IMD loss</th>
                  <th scope="col">HAMSTER / IMD lost</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {number(BigInt(i * rules.halfLoss))} to &lt;
                      {number(BigInt((i + 1) * rules.halfLoss))}
                    </th>
                    <td>{number(BigInt(rules.initialMiningRate / 2 ** i))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              <li>
                Only net binary loss counts after payouts and refunds in that
                hour; EXACT tickets are excluded, and an hour that crosses a
                halving shares its mining budget proportionally.
              </li>
              <li>
                After the hour’s loss history is finalized, open{" "}
                <a href="#hamster">$HAMSTER → Mine</a> and select{" "}
                <strong>Claim all</strong>; the grant vests gradually over{" "}
                {rules.vestingDays} days, counts as stake after the warm-up, and{" "}
                <strong>Withdraw vested</strong> sends the unlocked HAMSTER to
                your wallet.
              </li>
            </ul>
            <p className="docs-footnote" role="status">
              {mining.isError
                ? "The current mining rate could not refresh; see $HAMSTER for retry and maintenance controls."
                : mining.data
                  ? `Current vault rate: ${imd(mining.data[1], 2)} HAMSTER per eligible IMD lost (halving ${mining.data[2]}).`
                  : "Reading the current vault rate…"}{" "}
              The table is the base schedule; the vault can extend future
              emissions with unused boost reserves.
            </p>
          </Chapter>
          <Chapter id="staking">
            <ul>
              <li>
                Stake HAMSTER to share IMD rewards:{" "}
                <strong>
                  {rules.swapStakersPercent}% of gross IMD on HAMSTER/IMD pool
                  trades
                </strong>{" "}
                plus the <strong>{rules.binary.stakers}% staker share</strong>{" "}
                of fee-paying binary pools and EXACT tickets; voided and
                timed-out bets pay no game fees.
              </li>
              <li>
                In <a href="#hamster">$HAMSTER → Stake</a>, enter an amount and
                select <strong>Approve and stake</strong> or{" "}
                <strong>Stake</strong>; each new deposit or mining grant starts
                earning after a{" "}
                <strong>{rules.warmupHours}-hour warm-up</strong>.
              </li>
              <li>
                Rewards arrive over time: trading rewards stream over{" "}
                {rules.hookStreamDays} active days, game rewards over{" "}
                {rules.gameStreamDays} active days, and the separate drip
                releases gradually; rewards pause while no stake is eligible,
                and <strong>Claim rewards</strong> sends earned IMD to your
                wallet.
              </li>
              <li>
                Select <strong>Request unstake</strong> on a deposited lot to
                stop its rewards immediately, wait{" "}
                <strong>{rules.unstakeHours} hours</strong>, then select{" "}
                <strong>Withdraw unstaked</strong>; mined grants use{" "}
                <strong>Withdraw vested</strong> instead.
              </li>
            </ul>
          </Chapter>
          <Chapter id="leaderboard">
            <ul>
              <li>
                Only settled bets that were actually played count toward volume:
                binary markets need both sides, and EXACT tickets count when
                settled without a timeout.
              </li>
              <li>
                Refunded bets and pending hours do not count; the team wallet is
                not ranked.
              </li>
              <li>{LEADERBOARD_REWARD_TEXT} (WL means whitelist.)</li>
            </ul>
            <a className="docs-text-link" href="#leaderboard">
              See the Leaderboard ↗
            </a>
          </Chapter>
          <Chapter id="agents">
            <p>
              Agents can use the same contracts and rules as people; install the
              existing skill to get the contract addresses, ABI and play
              instructions.
            </p>
            <div className="docs-command">
              <code>npx skills add https://hamsterhour.fun</code>
              <CopyButton
                label="agent install command"
                value="npx skills add https://hamsterhour.fun"
              />
            </div>
            <a className="docs-text-link" href="#agents">
              Open the Agents tab ↗
            </a>
          </Chapter>
          <Chapter id="safety">
            <p>
              <strong>No owner can withdraw player funds.</strong> The team can
              schedule limited game settings, including the line for future
              windows, but cannot change an hour’s line once betting has opened.
            </p>
            <p>
              Settlement is by the IMD oracle with data from Squeekchain; the
              contracts were built, audited and deployed by the IMD swarm.
            </p>
            <ul className="docs-contracts">
              {contracts.map(([label, address, source]) => (
                <li key={address}>
                  <div className="docs-contract-head">
                    <h3>{label}</h3>
                    {source && (
                      <a href={source} target="_blank" rel="noreferrer">
                        Source ↗
                      </a>
                    )}
                  </div>
                  <a
                    className="docs-address"
                    href={`${r.deployment.network.explorer}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${label} on Etherscan: ${address}`}
                  >
                    {address}
                  </a>
                  <CopyButton value={address} label={`${label} address`} />
                </li>
              ))}
            </ul>
            <p className="docs-risk">
              <strong>Betting can lose money.</strong> Play only what you can
              afford to lose.
            </p>
          </Chapter>
          <Chapter id="faq">
            <div className="docs-faq">
              {[
                [
                  "Why was my bet refunded?",
                  <>
                    Your binary market may have had no bets on the other side,
                    your OVER/UNDER hour may have finished below{" "}
                    {rules.snoozeThreshold} passes, or the window may have timed
                    out. Open <a href="#my-bets">My bets</a> to claim any
                    available refund.
                  </>,
                ],
                [
                  "Why is my bet still pending?",
                  <>
                    Betting closes when the hour starts, but settlement waits
                    for all six published rounds and a valid IMD oracle result.
                    A timeout becomes available {rules.timeoutHours} hours after
                    the hour ends; someone must submit that onchain too.
                  </>,
                ],
                [
                  "When can I claim?",
                  <>
                    Binary payouts and refunds are claimable once the contract
                    records settlement or timeout. Jackpot winnings appear after
                    finalization in hour order, so return to{" "}
                    <a href="#my-bets">My bets</a> if the jackpot is still
                    pending.
                  </>,
                ],
                [
                  "Why does the hamster run so little during the day?",
                  <>
                    It often sleeps during daylight and tends to run at night,
                    roughly 21:00–06:00 UTC. That pattern can change; live
                    passes are informational and the settled oracle result
                    decides bets.
                  </>,
                ],
                [
                  "Do I need HAMSTER to play?",
                  <>
                    No: bets and tickets use IMD on Ethereum, and you also need
                    ETH to pay network fees. HAMSTER is for mining and staking,
                    which are optional.
                  </>,
                ],
                [
                  "What happens if nobody guesses the EXACT number?",
                  <>
                    The whole jar carries forward if no ticket is within the
                    ±0.5% band, or if the result is below{" "}
                    {rules.snoozeThreshold} passes. New ticket contributions,
                    binary fees and donations can grow it before a later win.
                  </>,
                ],
                [
                  "Is there a house edge?",
                  <>
                    There is no house taking the other side, but there are fees:{" "}
                    {100 - rules.binary.winners}% of each non-void binary pool
                    and {100 - rules.ticket.jackpot}% of ticket payments. The
                    fee tables above show where they go; a winning side can even
                    receive less than its stake when fees outweigh the losing
                    side’s money.
                  </>,
                ],
                [
                  "How do I get IMD?",
                  <>
                    Use the bet panel’s <strong>Get IMD</strong> link to open
                    Uniswap for the official IMD token, then keep ETH for
                    network fees. Check the IMD address in{" "}
                    <a href="#docs-safety">Contracts and safety</a> before
                    swapping.
                  </>,
                ],
              ].map(([question, answer]) => (
                <details key={String(question)}>
                  <summary>
                    {question}
                    <span aria-hidden="true" className="docs-faq-toggle" />
                  </summary>
                  <div>{answer}</div>
                </details>
              ))}
            </div>
          </Chapter>
          <div className="docs-end">
            <PixelIcon name="seed" />
            <p>Ready for a little guess?</p>
            <a className="button primary" href="#play">
              Make a pick ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
