import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Runtime } from "./config";
import { useGlobal, useToken, useVerification } from "./data";
import { errorText, units } from "./model";
import { WalletControl, WalletProvider } from "./Wallet";
import { TransactionProvider } from "./transactions";
import { Bet } from "./Bet";
import { Stake } from "./Stake";
import { History } from "./History";
import { Settings } from "./Settings";
import { Keeper } from "./Keeper";
import { Intro, SOCIAL } from "./Intro";
export function App({ runtime: r }: { runtime: Runtime }) {
  return (
    <WalletProvider r={r}>
      <TransactionProvider r={r}>
        <Game r={r} />
      </TransactionProvider>
    </WalletProvider>
  );
}
export function getIMDLink(token: string) {
  return `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=ETH&outputCurrency=${token}`;
}
function Game({ r }: { r: Runtime }) {
  const [tab, setTab] = useState("Bet"),
    [clock, setClock] = useState(Date.now());
  const global = useGlobal(r),
    verification = useVerification(r),
    queries = useQueryClient();
  const { address } = useConnection();
  const g = global.data,
    token = useToken(r, g?.IMD, address);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const now = g
    ? Number(g.timestamp) * 1000 + Math.max(0, clock - global.dataUpdatedAt)
    : clock;
  const fresh = !!g && !global.isError && clock - global.dataUpdatedAt < 45000;
  const ready = fresh && verification.data === true && !verification.isError;
  const props = { r, g, ready, now };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <div className="app-shell">
        <header className="header">
          <a
            className="brand"
            href="#bet"
            onClick={() => setTab("Bet")}
            aria-label="Hamster Hour home"
          >
            <img src="./favicon.svg" width="42" height="42" alt="" />
            <h1>HAMSTER HOUR</h1>
          </a>
          <div className="header-actions">
            <a
              className="social"
              href={SOCIAL}
              target="_blank"
              rel="noreferrer"
              aria-label="Hamster Hour on X"
            >
              X
            </a>
            <WalletControl r={r} />
          </div>
        </header>
        <nav className="navigation" aria-label="Game sections">
          <button
            className={tab === "Bet" ? "active" : ""}
            aria-current={tab === "Bet" ? "page" : undefined}
            onClick={() => setTab("Bet")}
          >
            Bet
          </button>
          <details className="more-menu">
            <summary>
              More <span aria-hidden="true">+</span>
            </summary>
            <div className="more-popover">
              {["Stake", "History", "Settle", "TEAM"].map((name) => (
                <button
                  key={name}
                  aria-current={tab === name ? "page" : undefined}
                  onClick={(e) => {
                    setTab(name);
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </details>
          <div className="balance-line">
            {address ? (
              <>
                <span>
                  {token.data?.balance === undefined
                    ? "Reading balance…"
                    : `${units(token.data.balance)} IMD`}
                </span>
                {g &&
                  token.data?.balance !== undefined &&
                  token.data.balance < 500000000000000000n && (
                    <a
                      href={getIMDLink(g.IMD)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get IMD
                    </a>
                  )}
              </>
            ) : (
              <span>Ethereum · IMD</span>
            )}
          </div>
        </nav>
        <main id="main">
          {tab === "Bet" ? (
            <Bet {...props} />
          ) : (
            <div className="secondary-page">
              <div className="section-title">
                <h2>{tab === "TEAM" ? "TEAM settings" : tab}</h2>
                <button className="text-button" onClick={() => setTab("Bet")}>
                  Back to betting
                </button>
              </div>
              {tab === "Stake" ? (
                <Stake {...props} />
              ) : tab === "History" ? (
                <History {...props} />
              ) : tab === "Settle" ? (
                <Keeper
                  {...props}
                  initialWindow={
                    g && g.currentWindow > 0n ? g.currentWindow - 1n : undefined
                  }
                />
              ) : (
                <Settings {...props} />
              )}
            </div>
          )}
          {(global.isError || verification.isError || (g && !fresh)) && (
            <div className="notice error" role="status">
              {verification.isError
                ? errorText(verification.error)
                : "The latest game data could not load. Refresh to try again."}
              <button onClick={() => void queries.invalidateQueries()}>
                Refresh
              </button>
            </div>
          )}
          <div className="sync-line">
            <span>
              {ready
                ? `Live from Ethereum · block ${g!.blockNumber}`
                : global.isError
                  ? "Waiting for game data"
                  : "Reading the game…"}
            </span>
            <button
              className="text-button"
              onClick={() => void queries.invalidateQueries()}
              disabled={global.isFetching}
            >
              {global.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </main>
        <footer>
          <span>One wheel. Every hour.</span>
          <div className="contract-links">
            <a href={SOCIAL} target="_blank" rel="noreferrer">
              X
            </a>
            {r.deployment.contracts.map((c) => (
              <a
                key={c.name}
                href={`${r.deployment.network.explorer}/address/${c.address}`}
                target="_blank"
                rel="noreferrer"
              >
                {c.name}
              </a>
            ))}
            <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
              Deployment
            </a>
          </div>
        </footer>
      </div>
      <Intro />
    </>
  );
}
