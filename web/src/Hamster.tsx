import { useState } from "react";
import { formatUnits } from "viem";
import { useConnection } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "./config";
import { usePositions, type GameEvent } from "./data";
import {
  HAMSTER,
  BATCH,
  buyTax,
  chunks,
  clock,
  loadMined,
  uniswapUrl,
  useHamsterAccount,
  useHamsterGlobal,
  useHamsterVerification,
  vaultTarget,
} from "./hamster";
import { amountValue, dateLabel, imd, number } from "./model";
import { useTransaction, TransactionStatus } from "./transactions";
import { useWalletControl } from "./Wallet";
import { CardHead, Empty, Help } from "./ui";
// Each card shows the shared transaction status only for actions it started.
type Area = { active: boolean; claim: () => void };
function Token({ r, now }: { r: Runtime; now: number }) {
  const g = useHamsterGlobal(r);
  const [copied, setCopied] = useState(false);
  const tax = g.data ? buyTax(g.data.startedAt, now) : undefined;
  async function copy() {
    try {
      await navigator.clipboard.writeText(HAMSTER.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const range = document.createRange();
      const node = document.getElementById("hamster-ca");
      if (node) {
        range.selectNodeContents(node);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
    }
  }
  return (
    <section className="card hamster-token" aria-labelledby="hamster-token">
      <div className="card-head">
        <h2 id="hamster-token">The token</h2>
      </div>
      <p className="small muted">Official contract address (CA)</p>
      <div className="ca-row">
        <code id="hamster-ca">{HAMSTER.token}</code>
        <button
          className="button"
          onClick={() => void copy()}
          aria-label="Copy the HAMSTER contract address"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span className="visually-hidden" role="status">
        {copied ? "Contract address copied" : ""}
      </span>
      <p className="ca-warning">Beware of fake tokens, this is the only CA.</p>
      <div className="row wrap">
        <a
          className="button primary"
          href={uniswapUrl(r.token.address)}
          target="_blank"
          rel="noreferrer"
        >
          Buy on Uniswap ↗
        </a>
        <a
          className="text-link"
          href={`${r.deployment.network.explorer}/token/${HAMSTER.token}`}
          target="_blank"
          rel="noreferrer"
        >
          View on Etherscan ↗
        </a>
      </div>
      {tax?.live && (
        <div className="tax-live" role="timer" aria-live="off">
          <div>
            <span>Buy tax now</span>
            <strong>{tax.tax}%</strong>
          </div>
          <div>
            <span>Tax reaches 0 in</span>
            <strong className="tabular">{clock(tax.endsIn)}</strong>
          </div>
          <p className="small muted">
            Anti-snipe tax on buys: 95% at pool start, 2 points lower every full
            minute, 0 after 48 minutes. Sells pay no tax.
          </p>
        </div>
      )}
      {g.isError && (
        <p className="small muted">Tax status could not load. It retries.</p>
      )}
    </section>
  );
}
function Mine({
  r,
  events,
  eventError,
  verified,
  status,
}: {
  r: Runtime;
  events?: GameEvent[];
  eventError: boolean;
  verified: boolean;
  status: Area;
}) {
  const { address } = useConnection(),
    wallet = useWalletControl(),
    tx = useTransaction(),
    positions = usePositions(r, address, events),
    account = useHamsterAccount(r, address);
  const run: typeof tx.run = (...args) => {
    status.claim();
    return tx.run(...args);
  };
  const losses = (positions.data ?? [])
    .filter((x) => x.loss > 0n)
    .map(({ k, loss }) => ({ k, loss }))
    .sort((a, b) => (a.k > b.k ? -1 : 1));
  const mined = useQuery({
    queryKey: ["hamster-mined", address, losses.map((x) => x.k).join(",")],
    queryFn: () => loadMined(r, address!, losses),
    enabled: !!address && !!positions.data,
    refetchInterval: 20000,
    retry: 1,
  });
  const [note, setNote] = useState("");
  const ready = (mined.data ?? []).filter((x) => (x.amount ?? 0n) > 0n);
  const total = ready.reduce((n, x) => n + x.amount!, 0n);
  async function claimAll() {
    const batches = chunks(
      ready.map((x) => x.k),
      BATCH,
    );
    for (const [i, batch] of batches.entries()) {
      setNote(
        batches.length > 1
          ? `Batch ${i + 1} of ${batches.length}: confirm in your wallet.`
          : "",
      );
      if (
        !(await run(
          "claimMined",
          [r.game.address, batch, address],
          false,
          vaultTarget(r),
        ))
      ) {
        setNote(
          i
            ? `${i} of ${batches.length} batches mined. The rest stay claimable.`
            : "",
        );
        return;
      }
    }
    setNote("Mined. Your HAMSTER now vests over 7 days and counts as stake.");
  }
  const grants = (account.data?.grants ?? []).filter(
    (g) => g.amount > g.withdrawn,
  );
  const due = grants.filter((g) => g.due > 0n);
  const dueTotal = due.reduce((n, g) => n + g.due, 0n);
  async function withdrawVested() {
    for (const batch of chunks(
      due.map((g) => g.id),
      BATCH,
    ))
      if (
        !(await run("withdrawVested", [address, batch], false, vaultTarget(r)))
      )
        return;
  }
  return (
    <section className="card hamster-mine" aria-labelledby="hamster-mine">
      <CardHead
        title="Mine"
        help="Every IMD you lose in a finalized hour mines HAMSTER at the rate in Stats. Hours are found from your bets on chain. Mined HAMSTER becomes a grant that vests over 7 days and earns staking rewards while it vests."
      />
      {!address ? (
        <Empty>
          <h3>Lost a bet? Mine it back.</h3>
          <p>Connect your wallet to see the hours you can mine.</p>
          <button className="button primary" onClick={wallet.open}>
            Connect wallet
          </button>
        </Empty>
      ) : (
        <>
          <div className="mine-head">
            <div>
              <span className="small muted">Ready to mine</span>
              <strong className="mine-total">{imd(total)} HAMSTER</strong>
            </div>
            <button
              className="button primary"
              disabled={!verified || tx.busy || ready.length === 0}
              onClick={() => void claimAll()}
            >
              Claim all
              {ready.length > BATCH
                ? ` in ${Math.ceil(ready.length / BATCH)} transactions`
                : ""}
            </button>
          </div>
          {note && <p className="small">{note}</p>}
          {eventError || positions.isError || mined.isError ? (
            <p className="error">
              Your hours could not load. They refresh automatically.
            </p>
          ) : !mined.data ? (
            <p className="small muted">Finding the hours you lost…</p>
          ) : mined.data.length === 0 ? (
            <p className="small muted">
              No losing hours yet. Lose a bet and it shows up here to mine.
            </p>
          ) : (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Hours you can mine"
            >
              <table className="hamster-table">
                <thead>
                  <tr>
                    <th scope="col">Hour</th>
                    <th scope="col">IMD lost</th>
                    <th scope="col">HAMSTER</th>
                  </tr>
                </thead>
                <tbody>
                  {mined.data.map((x) => (
                    <tr key={String(x.k)}>
                      <td>#{String(x.k)}</td>
                      <td>{imd(x.loss)}</td>
                      <td>
                        {x.mined
                          ? "Mined"
                          : x.waiting
                            ? x.waiting
                            : imd(x.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grant-block">
            <div className="mine-head">
              <div>
                <h3>Vesting grants</h3>
                <span className="small muted">
                  {imd(dueTotal)} HAMSTER vested and ready
                </span>
              </div>
              <button
                className="button"
                disabled={!verified || tx.busy || due.length === 0}
                onClick={() => void withdrawVested()}
              >
                Withdraw vested
              </button>
            </div>
            {grants.length === 0 ? (
              <p className="small muted">
                {account.data ? "No grants yet." : "Reading your grants…"}
              </p>
            ) : (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Vesting grants"
              >
                <table className="hamster-table">
                  <thead>
                    <tr>
                      <th scope="col">Started</th>
                      <th scope="col">Vested</th>
                      <th scope="col">Locked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((g) => (
                      <tr key={String(g.id)}>
                        <td>{dateLabel(g.startsAt)}</td>
                        <td>{imd(g.vested - g.withdrawn)}</td>
                        <td>{imd(g.locked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {status.active && <TransactionStatus r={r} />}
        </>
      )}
    </section>
  );
}
function Stake({
  r,
  now,
  verified,
  status,
}: {
  r: Runtime;
  now: number;
  verified: boolean;
  status: Area;
}) {
  const { address } = useConnection(),
    wallet = useWalletControl(),
    tx = useTransaction(),
    account = useHamsterAccount(r, address);
  const run: typeof tx.run = (...args) => {
    status.claim();
    return tx.run(...args);
  };
  const [text, setText] = useState(""),
    [fieldError, setFieldError] = useState("");
  const a = account.data;
  let amount: bigint | undefined;
  try {
    amount = text ? amountValue(text) : undefined;
  } catch {
    amount = undefined;
  }
  const needsApproval = !!a && amount !== undefined && a.allowance < amount;
  async function submit() {
    setFieldError("");
    let value: bigint;
    try {
      value = amountValue(text);
    } catch (e) {
      setFieldError((e as Error).message);
      return;
    }
    if (a && value > a.balance) {
      setFieldError("That is more HAMSTER than this wallet holds.");
      return;
    }
    if (a && a.allowance < value) {
      if (!(await run("approve", [HAMSTER.vault, value], true, vaultTarget(r))))
        return;
    }
    if (await run("stake", [value], false, vaultTarget(r))) setText("");
  }
  const lots = (a?.lots ?? []).filter((l) => !l.isGrant && l.amount > 0n);
  const queue = (a?.unstakes ?? []).filter((q) => !q.withdrawn);
  const releasable = queue.filter((q) => Number(q.readyAt) <= now);
  return (
    <section className="card hamster-stake" aria-labelledby="hamster-stake">
      <CardHead
        title="Stake"
        help="Staked HAMSTER starts earning after a 24 hour warm-up. Unstaking stops rewards at once; the tokens release 24 hours later. Rewards are paid in IMD."
      />
      {!address ? (
        <Empty>
          <h3>Stake HAMSTER, earn IMD.</h3>
          <p>Connect your wallet to stake and claim rewards.</p>
          <button className="button primary" onClick={wallet.open}>
            Connect wallet
          </button>
        </Empty>
      ) : (
        <>
          <dl className="stake-figures">
            <div>
              <dt>Your stake</dt>
              <dd>{imd(a?.staked)}</dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{imd(a?.balance)}</dd>
            </div>
            <div>
              <dt>Pending IMD</dt>
              <dd>
                {a
                  ? a.pending === undefined
                    ? "Updating"
                    : imd(a.pending, 4)
                  : "—"}
              </dd>
            </div>
          </dl>
          <button
            className="button"
            disabled={!verified || tx.busy || !a || a.pending === 0n}
            onClick={() =>
              void run("claimRewards", [address], false, vaultTarget(r))
            }
          >
            Claim rewards
          </button>
          <form
            className="stake-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="amount-label">
              <label htmlFor="stake-amount">Amount to stake</label>
              <button
                type="button"
                className="text-button"
                disabled={!a?.balance}
                onClick={() => a && setText(formatUnits(a.balance, 18))}
              >
                Max
              </button>
            </div>
            <div className="amount-control">
              <input
                id="stake-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={text}
                aria-invalid={!!fieldError}
                aria-describedby="stake-help stake-error"
                onChange={(e) => {
                  setText(e.target.value.trim());
                  setFieldError("");
                }}
              />
              <span>HAMSTER</span>
            </div>
            <p className="error" id="stake-error">
              {fieldError}
            </p>
            <p className="small muted" id="stake-help">
              Earning starts after a 24h warm-up.
            </p>
            <button
              className="button primary"
              type="submit"
              disabled={!verified || tx.busy}
            >
              {needsApproval ? "Approve and stake" : "Stake"}
            </button>
          </form>
          {lots.length > 0 && (
            <ul className="lot-list" aria-label="Your stake lots">
              {lots.map((l) => (
                <li key={String(l.id)}>
                  <div>
                    <strong>{imd(l.amount)} HAMSTER</strong>
                    <span className="small muted">
                      {Number(l.earnsAt) > now
                        ? `Warming up · earns in ${clock(Number(l.earnsAt) - now)}`
                        : "Earning"}
                    </span>
                  </div>
                  <button
                    className="button"
                    disabled={!verified || tx.busy}
                    onClick={() => {
                      if (
                        confirm(
                          `Unstake ${imd(l.amount)} HAMSTER? Rewards on it stop now and the tokens release after 24 hours.`,
                        )
                      )
                        void run(
                          "requestUnstake",
                          [l.id, l.amount],
                          false,
                          vaultTarget(r),
                        );
                    }}
                  >
                    Request unstake
                  </button>
                </li>
              ))}
            </ul>
          )}
          {queue.length > 0 && (
            <div className="unstake-block">
              <ul className="lot-list" aria-label="Unstake requests">
                {queue.map((q) => (
                  <li key={String(q.id)}>
                    <strong>{imd(q.amount)} HAMSTER</strong>
                    <span className="small muted">
                      {Number(q.readyAt) <= now
                        ? "Ready to withdraw"
                        : `Releases in ${clock(Number(q.readyAt) - now)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                className="button"
                disabled={!verified || tx.busy || releasable.length === 0}
                onClick={() =>
                  void (async () => {
                    for (const batch of chunks(
                      releasable.map((q) => q.id),
                      BATCH,
                    ))
                      if (
                        !(await run(
                          "withdrawUnstaked",
                          [address, batch],
                          false,
                          vaultTarget(r),
                        ))
                      )
                        return;
                  })()
                }
              >
                Withdraw unstaked
              </button>
            </div>
          )}
          {account.isError && (
            <p className="error">
              Your staking position could not load. It retries.
            </p>
          )}
          {status.active && <TransactionStatus r={r} />}
        </>
      )}
    </section>
  );
}
function HamsterStats({ r }: { r: Runtime }) {
  const g = useHamsterGlobal(r).data;
  return (
    <section className="card hamster-stats" aria-labelledby="hamster-stats">
      <CardHead
        title="Stats"
        help="Read live from the HAMSTER vault. The mining rate halves every 18,750 IMD lost across all players."
      />
      <dl className="hamster-figures">
        <div>
          <dt>Mining rate</dt>
          <dd>{g ? `${imd(g.rate, 0)}` : "—"}</dd>
          <dd className="small muted">HAMSTER per 1 IMD lost</dd>
        </div>
        <div>
          <dt>Next halving</dt>
          <dd>{g ? `${imd(g.nextHalvingIn, 0)} IMD` : "—"}</dd>
          <dd className="small muted">
            more lost · halving #{g ? number(g.halving + 1n) : "—"}
          </dd>
        </div>
        <div>
          <dt>Buckets left</dt>
          <dd>{g ? imd(g.miningLeft, 0) : "—"}</dd>
          <dd className="small muted">
            mining · {g ? imd(g.boostLeft, 0) : "—"} boost
          </dd>
        </div>
        <div>
          <dt>Total staked</dt>
          <dd>{g ? imd(g.totalStaked, 0) : "—"}</dd>
          <dd className="small muted">HAMSTER</dd>
        </div>
        <div>
          <dt>Paid to stakers</dt>
          <dd>{g ? imd(g.rewardsPaid, 2) : "—"}</dd>
          <dd className="small muted">IMD</dd>
        </div>
      </dl>
    </section>
  );
}
export function HamsterPage({
  r,
  now,
  events,
  eventError,
}: {
  r: Runtime;
  now: number;
  events?: GameEvent[];
  eventError: boolean;
}) {
  const verification = useHamsterVerification(r);
  const verified = verification.data === true;
  const [area, setArea] = useState<"mine" | "stake">();
  const at = (name: "mine" | "stake"): Area => ({
    active: area === name,
    claim: () => setArea(name),
  });
  return (
    <div className="hamster-page">
      <div className="section-intro">
        <div>
          <h1>Lose a bet, mine $HAMSTER.</h1>
          <p>Stake it to earn IMD from every bet and swap.</p>
        </div>
      </div>
      {verification.isError && (
        <div className="connection-note" role="status">
          HAMSTER contracts could not be verified. Actions stay paused.
        </div>
      )}
      <div className="hamster-grid">
        <Token r={r} now={now} />
        <Mine
          r={r}
          events={events}
          eventError={eventError}
          verified={verified}
          status={at("mine")}
        />
        <Stake r={r} now={now} verified={verified} status={at("stake")} />
        <HamsterStats r={r} />
        <section className="card hamster-how" aria-labelledby="hamster-how">
          <div className="card-head">
            <h2 id="hamster-how">How it works</h2>
            <Help label="how HAMSTER works">
              Mining follows the IMD you lost in each finalized hour. Grants
              vest linearly over 7 days and count as stake while they vest.
              Stakers share IMD from 5% of every bet and 0.5% of every
              HAMSTER/IMD swap.
            </Help>
          </div>
          <ol className="how-list">
            <li>Lose a bet and mine $HAMSTER.</li>
            <li>Mined HAMSTER vests over 7 days and counts as stake.</li>
            <li>
              Stakers earn IMD from 5% of every bet and 0.5% of every swap.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
