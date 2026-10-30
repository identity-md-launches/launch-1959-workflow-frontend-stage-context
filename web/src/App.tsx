import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Runtime } from "./config";
import {
  useGlobal,
  useWindow,
  useEvents,
  useVerification,
  type GameEvent,
} from "./data";
import { useStatus, useRounds, windowProgress } from "./live";
import { useStats, wakeEstimate } from "./telemetry";
import { BetPanel, type BetReceipt } from "./Bet";
import { Jackpot } from "./Jackpot";
import { MyBets } from "./MyBets";
import { Stats } from "./Stats";
import { Leaderboard, LeaderboardPreview } from "./Leaderboard";
import { useLeaderboard } from "./useLeaderboard";
import { HamsterPage } from "./Hamster";
import { Stream } from "./Stream";
import { ChatDrawer } from "./Chat";
import { Seed } from "./pixel";
import { WalletProvider, WalletControl } from "./Wallet";
import { TransactionProvider } from "./transactions";
import { CardHead, Help, Icon } from "./ui";
import { Share } from "./Share";
import { imd, shortAddress, number } from "./model";
import { blip } from "./sound";
import { Docs } from "./Docs";
const tabs = [
  ["play", "The wheel"],
  ["jackpot", "Jackpot"],
  ["stats", "Stats"],
  ["leaderboard", "Leaderboard"],
  ["my-bets", "My bets"],
  ["agents", "Agents"],
  ["hamster", "$HAMSTER"],
  ["docs", "How to play"],
] as const;
const currentTab = () =>
  location.hash.startsWith("#docs-")
    ? "docs"
    : tabs.some(([id]) => location.hash === `#${id}`)
      ? location.hash.slice(1)
      : "play";
const stored = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional. */
  }
};
function Onboarding() {
  const [step, setStep] = useState(() =>
    stored("hh-v2-intro", "") === "done" ? -1 : 0,
  );
  const [expanded, setExpanded] = useState(false);
  const steps = [
    [
      "Meet your tiny athlete",
      "Watch the real wheel. Pick OVER or UNDER the line, or bet on a snooze.",
    ],
    [
      "Choose your hour",
      "Bet IMD before the hour starts. Approve the amount, then confirm your bet.",
    ],
    [
      "Come back for the result",
      "The IMD oracle settles the count. Claim winnings or refunds from My bets.",
    ],
  ];
  return (
    <div className="onboarding">
      <button
        className="intro-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {step >= 0 ? `New here? ${step + 1}/3` : "New here?"}{" "}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div className="intro-content">
          <div className="intro-steps">
            {steps.map(([title, text], i) => (
              <div key={title} className={step === i ? "active" : ""}>
                <span className="intro-number">{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <button
            className="button"
            onClick={() => {
              if (step < 2) {
                setStep(Math.max(0, step + 1));
              } else {
                setStep(-1);
                setExpanded(false);
                save("hh-v2-intro", "done");
              }
            }}
          >
            {step < 2 ? "Next step →" : "Got it, let’s play"}
          </button>
        </div>
      )}
    </div>
  );
}
function Ticker({ events, error }: { events?: GameEvent[]; error: boolean }) {
  const recent = (events ?? [])
    .filter((e) =>
      [
        "BinaryBet",
        "Claimed",
        "Fed",
        "JackpotFinalized",
        "TicketBought",
      ].includes(e.eventName),
    )
    .slice(-5)
    .reverse();
  const text = (e: GameEvent) =>
    e.eventName === "BinaryBet"
      ? `${shortAddress(e.args.bettor)} bet ${imd(e.args.amount)} IMD ${e.args.market === 0 ? (e.args.side ? "over" : "under") : e.args.side ? "on snooze" : "against snooze"}`
      : e.eventName === "Claimed"
        ? `${shortAddress(e.args.account)} claimed ${imd(e.args.amount)} IMD`
        : e.eventName === "Fed"
          ? `${shortAddress(e.args.from)} fed ${imd(e.args.amount)} IMD`
          : e.eventName === "TicketBought"
            ? `${shortAddress(e.args.bettor)} guessed ${number(e.args.guess)} passes`
            : `Jackpot ${e.args.winners > 0n ? "hit" : "rolled over"} · ${imd(e.args.pot)} IMD`;
  return (
    <div className="event-ticker">
      <span className="ticker-label">
        <i className="status-dot" /> Around the wheel
      </span>
      <div
        className="ticker-items"
        tabIndex={0}
        role="region"
        aria-label="Recent on-chain activity"
      >
        {recent.length ? (
          recent.map((e) => (
            <a
              href={`https://etherscan.io/tx/${e.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              key={e.transactionHash + e.logIndex}
            >
              {text(e)} ↗
            </a>
          ))
        ) : (
          <span>
            {error
              ? "Activity is reconnecting."
              : events
                ? "A quiet little moment. The next bet could be yours."
                : "Listening for bets, wins and little acts of kindness…"}
          </span>
        )}
      </div>
    </div>
  );
}
function Game({ r }: { r: Runtime }) {
  const global = useGlobal(r),
    verification = useVerification(r),
    events = useEvents(r),
    status = useStatus(),
    rounds = useRounds(),
    stats = useStats(7),
    cache = useQueryClient();
  const [selected, setSelected] = useState<bigint>(),
    [now, setNow] = useState(() => Math.floor(Date.now() / 1000)),
    [tab, setTab] = useState(currentTab),
    [theme, setTheme] = useState(() => stored("hh-theme", "auto")),
    [sound, setSound] = useState(() => stored("hh-sound", "off") === "on"),
    [paused, setPaused] = useState(false),
    [shared, setShared] = useState<BetReceipt>();
  const leaderboard = useLeaderboard(
    r,
    tab === "play" || tab === "leaderboard",
  );
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const listener = () => setTab(currentTab());
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    document.querySelector(".site")?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
    const nav = document.querySelector(".site-header nav"),
      active = nav?.querySelector<HTMLElement>("a.active");
    if (nav && active && nav.scrollWidth > nav.clientWidth)
      nav.scrollLeft =
        active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [tab]);
  useEffect(() => {
    if (
      global.data &&
      (selected === undefined ||
        selected < global.data.earliestNotStartedWindow)
    )
      setSelected(global.data.earliestNotStartedWindow);
  }, [global.data?.earliestNotStartedWindow, selected]);
  const current = useWindow(r, global.data?.currentWindow);
  const telemetryFresh =
    !!status.data &&
    !status.isError &&
    status.data.freshness === "online" &&
    (!status.data.observedAt ||
      now - Date.parse(status.data.observedAt) / 1000 < 180);
  const running = telemetryFresh && status.data!.speedMmPerSecond > 0;
  const night = theme === "night" || (theme === "auto" && running);
  useEffect(() => {
    document.documentElement.dataset.theme = night ? "night" : "day";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", night ? "#1E1A2E" : "#FFF5E6");
  }, [night]);
  const progress = current.data
    ? windowProgress(
        current.data.window.startsAt,
        current.data.window.endsAt,
        BigInt(now),
        current.data.window.line,
        status.data,
        rounds.data,
      )
    : undefined;
  const wake = wakeEstimate(stats.data, new Date(now * 1000));
  const seeds = Array.from({ length: 6 }, (_, i) => {
    if (!current.data || !rounds.data) return undefined;
    const first = (current.data.window.startsAt - 1791847800n) / 600n + 1n;
    const target = first + BigInt(i);
    const exact = rounds.data.find(
      (x) =>
        x.settledThroughRound === target &&
        x.previousSettledThroughRound === target - 1n,
    );
    if (exact) return exact.workAdded;
    const start = Number(current.data.window.startsAt) + i * 600;
    if (
      telemetryFresh &&
      now >= start &&
      now < start + 600 &&
      status.data?.liveCounter !== undefined
    ) {
      const baseline = rounds.data.find(
        (x) => x.settledThroughRound === target - 1n,
      );
      if (baseline)
        return status.data.liveCounter > baseline.cumulativeWork
          ? status.data.liveCounter - baseline.cumulativeWork
          : 0n;
    }
    return undefined;
  });
  return (
    <div
      className={`${paused ? "site motion-paused" : "site"} ${tab === "play" ? "wheel-page" : ""}`}
    >
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#play" aria-label="Hamster Hour home">
          <img src="./favicon.svg" width="35" height="35" alt="" />
          <span>
            hamster<span className="brand-hour">hour</span>
            <i />
          </span>
        </a>
        <nav aria-label="Main navigation">
          {tabs.map(([id, label]) => (
            <a
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              href={`#${id}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button sound-toggle"
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            aria-pressed={sound}
            onClick={() => {
              save("hh-sound", !sound ? "on" : "off");
              setSound(!sound);
              if (!sound) blip();
            }}
          >
            <Icon name={sound ? "sound" : "mute"} />
          </button>
          <button
            className="icon-button"
            aria-label={night ? "Switch to day theme" : "Switch to night theme"}
            title={
              theme === "auto"
                ? "Theme follows the hamster"
                : "Manual theme · double click to follow the hamster"
            }
            onClick={() => {
              const next = night ? "day" : "night";
              setTheme(next);
              save("hh-theme", next);
            }}
            onDoubleClick={() => {
              setTheme("auto");
              save("hh-theme", "auto");
            }}
          >
            <Icon name={night ? "sun" : "moon"} />
          </button>
          <WalletControl r={r} />
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {tab === "docs" ? (
          <Docs r={r} />
        ) : tab === "stats" ? (
          <Stats
            r={r}
            g={global.data}
            events={events.data}
            eventError={events.isError}
            now={now}
          />
        ) : tab === "leaderboard" ? (
          <Leaderboard r={r} data={leaderboard} />
        ) : tab === "hamster" ? (
          <HamsterPage
            r={r}
            now={now}
            events={events.data}
            eventError={events.isError}
          />
        ) : tab === "jackpot" ? (
          <div className="jackpot-page">
            <div className="section-intro">
              <div>
                <h1>The jackpot jar.</h1>
                <p>Guess the passes, or feed the next prize.</p>
              </div>
            </div>
            <Jackpot
              r={r}
              g={global.data}
              k={selected}
              events={events.data}
              eventError={events.isError}
              setK={setSelected}
            />
          </div>
        ) : tab === "agents" ? (
          <div className="agents-page">
            <div className="section-intro">
              <div>
                <h1>AI agents can play.</h1>
                <p>
                  Same wheel. Same rules. A skill for your agent’s next guess.
                </p>
              </div>
            </div>
            <section className="agents-section">
              <a
                className="button"
                href="./SKILL.md"
                target="_blank"
                rel="noreferrer"
              >
                Read the skill ↗
              </a>
              <code>npx skills add https://hamsterhour.fun</code>
            </section>
          </div>
        ) : tab === "my-bets" ? (
          <div className="bets-page">
            <div className="section-intro">
              <div>
                <h1>Your place by the wheel.</h1>
                <p>Good guesses, sleepy hours, and everything you can claim.</p>
              </div>
            </div>
            <MyBets r={r} events={events.data} eventError={events.isError} />
          </div>
        ) : (
          <>
            <div className="hero">
              <div>
                <h1>
                  Bet on the hamster<span className="headline-period">.</span>
                </h1>
                <p>A real hamster. Bets in IMD.</p>
              </div>
              <Onboarding />
            </div>
            {(global.isError || verification.isError) && (
              <div className="connection-note" role="status">
                Ethereum reads are unavailable. Betting stays paused until
                verification succeeds.{" "}
                <button onClick={() => void cache.invalidateQueries()}>
                  Try again
                </button>
              </div>
            )}
            <div className="play-grid">
              <div className="wheel-column">
                <section className="card habitat">
                  <CardHead
                    title="Live from the wheel"
                    help="The pixel hamster follows live wheel speed, not whether the camera is online. An unavailable or stale speed is shown as unknown. Live counters are informational; the oracle’s settled passes determine the result."
                  >
                    <span className={`mood-pill ${running ? "awake" : ""}`}>
                      <i />
                      {!telemetryFresh
                        ? "Checking in"
                        : running
                          ? "On a little run"
                          : "Taking a snooze"}
                    </span>
                  </CardHead>
                  <Stream
                    running={running}
                    fresh={telemetryFresh}
                    wake={wake}
                    paused={paused}
                    setPaused={setPaused}
                    now={now}
                  />
                  <div className="hour-progress">
                    <div className="odometer">
                      <span>
                        This hour’s passes{" "}
                        <Help label="live passes">
                          Hardware count minus the nearest known count before
                          this hour. An approximate baseline is marked ≈. If no
                          baseline exists, the count stays unknown. It never
                          settles a bet.
                        </Help>
                      </span>
                      <strong className="pixel">
                        {telemetryFresh && progress?.passes !== undefined
                          ? `${progress.approximate ? "≈" : ""}${number(progress.passes)}`
                          : "—"}
                      </strong>
                    </div>
                    <div className="seed-progress">
                      <div
                        className="seeds"
                        aria-label="Six ten-minute intervals in this hour"
                      >
                        {seeds.map((n, i) => (
                          <span
                            key={i}
                            title={
                              n === undefined
                                ? `Interval ${i + 1}: no exact telemetry`
                                : `Interval ${i + 1}: ${number(n!)} passes`
                            }
                          >
                            <Seed
                              fill={
                                n === undefined
                                  ? 0
                                  : Math.min(
                                      1,
                                      Number(n) /
                                        Math.max(
                                          1,
                                          Number(
                                            current.data?.window.line ?? 2100n,
                                          ) / 6,
                                        ),
                                    )
                              }
                            />
                          </span>
                        ))}
                      </div>
                      <span>6 seeds · 10 minutes each</span>
                    </div>
                  </div>
                </section>
              </div>
              <BetPanel
                r={r}
                g={global.data}
                k={selected}
                setK={setSelected}
                now={now}
                onBet={setShared}
              />
            </div>
            <Jackpot
              r={r}
              g={global.data}
              k={selected}
              compact
              events={events.data}
              eventError={events.isError}
            />
            <Ticker events={events.data} error={events.isError} />
            <LeaderboardPreview r={r} data={leaderboard} />
          </>
        )}
      </main>
      {tab !== "play" && (
        <footer>
          <a className="footer-brand" href="#play">
            hamster hour <span>Small animal. Actual stakes.</span>
          </a>
          <div>
            <a
              href="https://x.com/hamsterhourgame"
              target="_blank"
              rel="noreferrer"
            >
              Follow on X ↗
            </a>
            <a
              href={`${r.deployment.network.explorer}/address/${r.game.address}`}
              target="_blank"
              rel="noreferrer"
            >
              Contract ↗
            </a>
            <button
              className="text-button"
              onClick={() => {
                save("hh-sound", !sound ? "on" : "off");
                setSound(!sound);
                if (!sound) blip();
              }}
            >
              {sound ? "Sound on" : "Sound off"}
            </button>
            <button
              className="text-button"
              onClick={() => {
                setTheme("auto");
                save("hh-theme", "auto");
              }}
            >
              Auto theme {theme === "auto" ? "✓" : ""}
            </button>
          </div>
          <p>
            Settled by the IMD oracle, data from{" "}
            <a
              href="https://sepolia.squeekchain.com"
              target="_blank"
              rel="noreferrer"
            >
              Squeekchain
            </a>
            .
          </p>
        </footer>
      )}
      <ChatDrawer r={r} g={global.data} />
      {shared && <Share bet={shared} close={() => setShared(undefined)} />}
    </div>
  );
}
export function App({ runtime }: { runtime: Runtime }) {
  return (
    <WalletProvider r={runtime}>
      <TransactionProvider r={runtime}>
        <Game r={runtime} />
      </TransactionProvider>
    </WalletProvider>
  );
}
