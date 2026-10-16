import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Runtime } from "./config";
import { useGlobal, useJackpot, useVerification, useWindow } from "./data";
import { countdown, errorText, units } from "./model";
import { WalletControl, WalletProvider } from "./Wallet";
import { TransactionProvider } from "./transactions";
import { Bet } from "./Bet";
import { Stake } from "./Stake";
import { History } from "./History";
import { Settings } from "./Settings";
import { Stream } from "./Stream";
import { AddressLink, Stat } from "./ui";
import { zeroAddress } from "viem";
export function App({ runtime: r }: { runtime: Runtime }) {
  return (
    <WalletProvider r={r}>
      <TransactionProvider r={r}>
        <Game r={r} />
      </TransactionProvider>
    </WalletProvider>
  );
}
function Game({ r }: { r: Runtime }) {
  const [tab, setTab] = useState(0),
    [customWindow, setCustomWindow] = useState<bigint>(),
    [clock, setClock] = useState(Date.now());
  const global = useGlobal(r),
    verification = useVerification(r),
    jackpot = useJackpot(r, global.data);
  const queries = useQueryClient();
  const g = global.data,
    k = customWindow ?? g?.candidate;
  const w = useWindow(r, k);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const now = g
    ? Number(g.timestamp) * 1000 + Math.max(0, clock - global.dataUpdatedAt)
    : clock;
  const fresh = !!g && !global.isError && clock - global.dataUpdatedAt < 45000;
  const ready = fresh && verification.data === true && !verification.isError;
  const bettingClose =
    g && k !== undefined && w.data
      ? g.genesisTimestamp + k * 3600n < w.data.times[0]
        ? g.genesisTimestamp + k * 3600n
        : w.data.times[0]
      : undefined;
  const line =
    w.data?.window.status === 0 ? g?.currentLine : w.data?.window.line;
  const currentClose = g
    ? g.genesisTimestamp + (g.currentWindow + 1n) * 3600n
    : undefined;
  function changeTab(i: number) {
    setTab(i);
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <div className="app-shell">
        <header className="header">
          <a className="brand" href="#" aria-label="Hamster Hour home">
            <img src="./favicon.svg" width="34" height="34" alt="" />
            <h1>Hamster Hour</h1>
          </a>
          <WalletControl r={r} />
        </header>
        <div className="intro">
          <p>IMD bets on six hamster rounds.</p>
          <span className="network-name">{r.chain.name}</span>
        </div>
        <Stream />
        <section className="overview" aria-label="Current game state">
          <Stat label="Betting closes in">{countdown(bettingClose, now)}</Stat>
          <Stat label="The line">
            {line === undefined ? "…" : `${line} passes`}
          </Stat>
          <Stat label="Available jackpot">
            {!g
              ? "Loading…"
              : g.jackpotToken === zeroAddress
                ? "Not configured"
                : jackpot.isError
                  ? "Unavailable"
                  : jackpot.data
                    ? `${units(jackpot.data.available, jackpot.data.decimals)} ${jackpot.data.symbol}`
                    : "Loading…"}
          </Stat>
        </section>
        <div className="sync-line">
          <span className={ready ? "synced" : "muted"}>
            {ready
              ? `Block ${g!.blockNumber} · synced`
              : global.isError || verification.isError
                ? "Chain reads unavailable"
                : "Verifying deployment…"}
          </span>
          <button
            onClick={() => void queries.invalidateQueries()}
            disabled={global.isFetching}
          >
            {global.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {(global.isError || verification.isError || (g && !fresh)) && (
          <div className="notice error" role="status">
            {verification.isError
              ? errorText(verification.error)
              : "Contract state is unavailable or stale. Refresh to retry. Transactions are disabled."}
          </div>
        )}
        <main id="main">
          <nav className="tabs" role="tablist" aria-label="Game sections">
            {["Bet", "Stake", "History"].map((name, i) => (
              <button
                role="tab"
                id={`tab-${i}`}
                aria-selected={tab === i}
                aria-controls={`panel-${i}`}
                tabIndex={tab === i ? 0 : -1}
                key={name}
                onClick={() => changeTab(i)}
                onKeyDown={(e) => {
                  let next = i;
                  if (e.key === "ArrowRight") next = (i + 1) % 3;
                  else if (e.key === "ArrowLeft") next = (i + 2) % 3;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = 2;
                  else return;
                  e.preventDefault();
                  changeTab(next);
                  document.getElementById(`tab-${next}`)?.focus();
                }}
              >
                {name}
                <span aria-hidden="true">{["↗", "+", "↶"][i]}</span>
              </button>
            ))}
          </nav>
          <div
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
          >
            {tab === 0 ? (
              <Bet
                r={r}
                g={g}
                ready={ready}
                now={now}
                k={k}
                setK={setCustomWindow}
              />
            ) : tab === 1 ? (
              <Stake r={r} g={g} ready={ready} now={now} />
            ) : (
              <History r={r} g={g} ready={ready} now={now} />
            )}
          </div>
          <section className="round-strip">
            <span>
              Current window {g?.currentWindow.toString() ?? "…"} · round{" "}
              {g?.currentRound.toString() ?? "…"}
            </span>
            <span>Window ends in {countdown(currentClose, now)}</span>
          </section>
          <Settings r={r} g={g} ready={ready} now={now} />
        </main>
        <footer>
          <div>
            <strong>One wheel. Open rules.</strong>
            <p>
              No owner. No house. Pari-mutuel pools, settled only by the IMD
              oracle.
            </p>
            <p className="small muted">
              TEAM receives 1% of non-void bets. The contract has no admin
              withdrawal or upgrade. Exact-transfer token assumptions apply.
            </p>
          </div>
          <div className="contract-links">
            {r.deployment.contracts.map((c) => (
              <AddressLink
                key={c.name}
                r={r}
                value={c.address}
                label={c.name}
              />
            ))}
            <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
              Deployment record ↗
            </a>
            <a
              href={`https://github.com/identity-md-launches/launch-1951-workflow-contract-stage-context/tree/${r.deployment.sourceCommit}`}
              target="_blank"
              rel="noreferrer"
            >
              Deployed contract source ↗
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
